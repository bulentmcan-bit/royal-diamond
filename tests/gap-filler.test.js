// ═══════════════════════════════════════════════════════════════════════════
// The automatic gap-filler — the REAL planner and runner out of
// worker/src/index.js, with the REAL crown-config.js, run against a small
// diary and a recording stub for fetch. No network, no Piyzi, no key.
//
//   1. the settings, as crown-config.js has them TODAY: live (dry run OFF
//      since 14 Eylül 2026), enabled, cap 25 (5 on the first live day), hold 45,
//      5 days, due after 10, Hannah first, Hannah not before 14 Eylül. Every
//      other section runs on REH — the same config with dry run ON and cap 25
//      — so the cap arithmetic and the dry-run rehearsal keep their fixed
//      numbers whatever Bülent sets the operational switches to.
//   2. the walk: fillOrder, the start ladder, her booked hours skipped,
//      today's notice, the DUE customers before the pull-forwards, a lash
//      customer never to Helen, a wax customer only to Helen, one customer
//      one offer, one slot one customer
//   3. who is left out: KAPALI, a bad phone, an opt-out (notes / the map),
//      not yet due, gone too long, the 7-day cooldown
//   3b. one phone is one customer: two records with the same number are
//      offered once, their bookings pool, an offer to either counts for both
//   4. the soft hold: an active hold blocks the slot, a stale one is
//      released, an offer whose customer booked is marked booked
//   5. the daily cap counts what the day's log already holds
//   6. notBefore is judged against the slot's date: on the 11th Hannah's
//      Monday-the-14th hours are offered, her Friday and Saturday ones not
//   7. the 3-day distance rule and the same-day rule
//   8. the runner: dry run reads, records, sends NOTHING; enabled=false
//      reads nothing; the panel's pause stops it; live without a template
//      sends nothing and says so; live sends, claiming each offer first
//   9. the cron line and the dispatch by salon hour are in place
//
// Run:  node tests/gap-filler.test.js
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
  const c = { window: {}, console }; vm.createContext(c); vm.runInContext(src, c);
  return c.window.CROWN;
}
const C = loadCrown();
// The rehearsal config: the real crown-config.js with the two OPERATIONAL
// switches pinned — dry run ON, cap 25 — so the cap arithmetic and the
// dry-run rehearsal below do not drift when Bülent turns the live switches
// (section 1 pins those on C itself). Nothing else is pinned: the scenario
// diary holds under the live hold, days-ahead and due values, proven by
// running it unpinned when they were tuned on 14 Eylül.
const REH = Object.assign({}, C, { gapFill: Object.assign({}, C.gapFill, { dryRun: true, dailyCap: 25 }) });

// The worker slice, with a recording fetch. `store` answers the Firebase
// reads by path; every call is kept for the assertions.
function makeWorker(store, opts) {
  opts = opts || {};
  const calls = [], logs = [];
  const fetch = async (url, init) => {
    init = init || {};
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url: String(url), method, body });
    if (String(url).startsWith('https://api.piyzi.com')) {
      const failIt = opts.piyziFail && opts.piyziFail(body);
      return { ok: !failIt, status: failIt ? 400 : 200, json: async () => failIt ? { success: false, error: { code: 'TEMPLATE_PAUSED', message: 'x' } } : { success: true, data: { messageUid: 'uid-' + calls.length } } };
    }
    const m = String(url).match(/firebaseio\.com\/(.+?)\.json/);
    const p = m ? decodeURIComponent(m[1]) : '';
    if (method === 'GET') { const v = Object.prototype.hasOwnProperty.call(store, p) ? store[p] : null; return { ok: true, status: 200, json: async () => v }; }
    // A written run record shows up in the run list, as it would in Firebase.
    const rm = method === 'PUT' && p.match(/^rdns_gapfill_v1\/runs\/(\d+)$/);
    if (rm) (store['rdns_gapfill_v1/runs'] = store['rdns_gapfill_v1/runs'] || {})[rm[1]] = true;
    return { ok: true, status: 200, json: async () => null, text: async () => '' };
  };
  const src = fs.readFileSync(path.join(__dirname, '..', 'worker', 'src', 'index.js'), 'utf8');
  const cut = src.indexOf('\nexport {');
  const ctx = {
    console: { log: (...a) => logs.push(a.join(' ')), warn: () => {}, error: () => {} },
    TextEncoder, Intl, setTimeout, AbortSignal, fetch, Response: class {},
    R_PAGE: '', CROWN: opts.crown || REH
  };
  vm.createContext(ctx);
  vm.runInContext(src.slice(0, cut).replace(/^import .*$/gm, '') +
    '\n;__api = { gfConfig, gfPlan, gfOptedOut, runGapFiller, nicosiaMinutes, waPhone, gfDayWord };', ctx, { filename: 'worker-slice.js' });
  return { api: ctx.__api, calls, logs };
}

// ── the diary: Tuesday 15 Eylül 2026, 10:00 at the salon ─────────────────
const NOW = Date.UTC(2026, 8, 15, 7, 0);     // 10:00 Nicosia (summer, +3)
const TODAY = '2026-09-15';
const daysAgo = n => { const d = new Date(Date.UTC(2026, 8, 15) - n * 86400e3); return d.toISOString().slice(0, 10); };
const clients = [
  { id: 1, name: 'Ayşe', phone: '0533 111 1111' },                   // manicure, 21 days ago — due
  { id: 2, name: 'Bella', phone: '0533 222 2222' },                  // lashes, 26 days ago — due, Lissa/Hannah only
  { id: 3, name: 'Ceyda', phone: '0533 333 3333' },                  // holds a manicure on the 19th — pull-forward
  { id: 4, name: 'Deniz', phone: '0533 444 4444' },                  // 5 days ago and booked today 11:00 with Hannah — engaged, not due
  { id: 5, name: 'KAPALI — Personel', phone: '0533 555 5555' },      // the blocker
  { id: 6, name: 'Elif', phone: '0533 666 6666', notes: 'mesaj istemiyor' },
  { id: 7, name: 'Fatma', phone: '12345' },                          // unusable phone
  { id: 8, name: 'Gül', phone: '0533 888 8888' },                    // in the opt-out map
  { id: 9, name: 'Hale', phone: '0533 999 9999' },                   // wax, 20 days ago — Helen only
  { id: 10, name: 'İrem', phone: '0533 101 0101' },                  // 200 days ago — win-back, not a gap
  { id: 11, name: 'Jale', phone: '0533 111 1112' },                  // 30 days ago, offered 3 days ago — cooldown
  { id: 12, name: 'Kübra', phone: '0533 121 2121' },                 // 35 days ago, offered 8 days ago — free again
];
const A = (id, clientId, staff, dt, service) => ({ id, clientId, staff, datetime: dt, duration: 60, service, status: 'confirmed' });
const appointments = [
  A(101, 1, 'Helen', daysAgo(21) + 'T10:00', 'Klasik Manikür'),
  A(102, 2, 'Lissa', daysAgo(26) + 'T11:00', 'Klasik Kirpik Uygulaması'),
  A(103, 3, 'Helen', daysAgo(40) + 'T10:00', 'Dolgu (Infill)'),
  A(104, 3, 'Helen', '2026-09-19T10:00', 'Dolgu (Infill)'),
  A(105, 4, 'Hannah', daysAgo(5) + 'T10:00', 'Klasik Manikür'),
  A(106, 4, 'Hannah', '2026-09-15T11:00', 'Klasik Manikür'),           // Hannah busy 11:00 today
  A(107, 5, 'Helen', daysAgo(30) + 'T10:00', 'Klasik Manikür'),
  A(108, 6, 'Helen', daysAgo(30) + 'T10:00', 'Klasik Manikür'),
  A(109, 7, 'Helen', daysAgo(30) + 'T10:00', 'Klasik Manikür'),
  A(110, 8, 'Helen', daysAgo(40) + 'T10:00', 'Klasik Manikür'),
  A(111, 9, 'Helen', daysAgo(20) + 'T10:00', 'Bikini Ağda'),
  A(112, 10, 'Helen', daysAgo(200) + 'T10:00', 'Klasik Manikür'),
  A(113, 11, 'Lissa', daysAgo(30) + 'T10:00', 'Klasik Manikür'),
  A(114, 12, 'Lissa', daysAgo(35) + 'T10:00', 'Klasik Manikür'),
  A(115, 4, 'Helen', '2026-09-15T11:00', 'Klasik Manikür'),            // Helen busy 11:00–13:00 today
  A(116, 4, 'Helen', '2026-09-15T12:00', 'Klasik Manikür'),
  { id: 117, clientId: 1, staff: 'Hannah', datetime: '2026-09-15T14:00', duration: 60, service: 'x', status: 'cancelled' },   // cancelled: not a booking
];
const data = { appointments, clients };
const optout = { '905338888888': { ts: 1 } };
const baseOffers = {
  'old-jale': { d: '2026-09-13', t: '10:00', tech: 'Lissa', cid: '11', phone: '905331111112', ts: NOW - 3 * 86400e3, day: daysAgo(3), st: 'expired' },
  'old-kubra': { d: '2026-09-08', t: '10:00', tech: 'Lissa', cid: '12', phone: '905331212121', ts: NOW - 8 * 86400e3, day: daysAgo(8), st: 'expired' },
};

console.log('1. the settings');
{
  const { api } = makeWorker({}, { crown: C });
  const cfg = api.gfConfig();
  is(cfg.gap.dryRun, false, 'dry run is OFF — live since 14 Eylül 2026');
  is(cfg.gap.enabled, true, 'enabled');
  is([cfg.gap.dailyCap, cfg.gap.holdMinutes, cfg.gap.daysAhead, cfg.gap.cooldownDays, cfg.gap.noticeMinutes, cfg.gap.dueAfterDays, cfg.gap.dueUntilDays], [25, 45, 5, 7, 60, 10, 120], 'cap 25, hold 45 (clears before the next hourly run), 5 days, 7-day cooldown, 60-minute notice, due 10–120 days (tuned 14 Eylül evening after the first live day)');
  is(cfg.fillMinDaysAhead, 3, 'the distance rule is the fill-call list\'s 3');
  is(cfg.notBefore, { hannah: '2026-09-14' }, 'Hannah not before 14 Eylül');
  is([cfg.gap.cancelledWindowDays, cfg.gap.offerNoShows], [14, false], 'the cancelled route: 14-day window (30 on the first day: ~74 women would have crowded the due out for three days), no-shows NOT offered (Bülent\'s switch, off by default)');
  is(api.gfConfig(Object.assign({}, C, { gapFill: Object.assign({}, C.gapFill, { offerNoShows: 'yes', cancelledWindowDays: 'x' }) })).gap.offerNoShows, false, "offerNoShows: 'yes' is not true — no-shows stay out");
  is(api.gfConfig(Object.assign({}, C, { gapFill: Object.assign({}, C.gapFill, { cancelledWindowDays: undefined }) })).gap.cancelledWindowDays, 14, 'a missing window is 14');
  is(cfg.gap.cancelMinNoticeHours, 24, 'the cancelled route wants 24 hours\' notice — a same-day canceller is not chased (Bülent\'s decision)');
  is(api.gfConfig(Object.assign({}, C, { gapFill: Object.assign({}, C.gapFill, { cancelMinNoticeHours: undefined }) })).gap.cancelMinNoticeHours, 24, 'a missing notice setting is 24 as well');
  is(cfg.fillOrderOn(TODAY).map(o => o.key), ['hannah', 'lissa', 'helen', 'beyhan'], 'fill order on a Tuesday: Hannah, Lissa, Helen, then Beyhan (not in fillOrder, appended); Zara is off Tuesdays');
  is(cfg.fillOrderOn('2026-09-14').map(o => o.key), ['hannah', 'lissa', 'helen', 'zara'], 'on a Monday: Hannah, Lissa, Helen, then Zara; Beyhan is off Mondays');
  is(cfg.fillOrderOn('2026-09-17').map(o => o.key), ['hannah', 'lissa', 'helen', 'zara', 'beyhan'], 'on a Thursday: all five');
  is(cfg.fillOrderOn('2026-09-16').map(o => o.key), ['hannah', 'lissa', 'helen'], 'on a Wednesday: the three');
  is(cfg.ladder[0] + '-' + cfg.ladder[cfg.ladder.length - 1] + '/' + cfg.ladder.length, '480-1080/12', 'the start ladder: 08:00 … 18:00, 12 rungs');
  // the safe way round for a broken config
  const bad = api.gfConfig(Object.assign({}, C, { gapFill: { dryRun: 'no', enabled: 'yes', dailyCap: 'lots' } }));
  is([bad.gap.dryRun, bad.gap.enabled, bad.gap.dailyCap], [true, true, 0], 'nonsense dryRun stays ON, nonsense cap is 0 — nothing sent, never 25');
  is(api.gfConfig({}), null, 'a CROWN without the helpers → no config, the run aborts');
  is(api.nicosiaMinutes(new Date(NOW)), 600, 'the salon clock reads 10:00');
}

console.log('2. the walk');
{
  const { api } = makeWorker({});
  const cfg = api.gfConfig();
  const plan = api.gfPlan({ data, offers: baseOffers, optout, cfg, nowMs: NOW, todayYmd: TODAY, nowMin: 600 });
  const brief = plan.offers.map(o => [o.d, o.t, o.tech, o.name]);
  is(brief, [
    ['2026-09-15', '12:00', 'Hannah', 'Ayşe'],
    ['2026-09-15', '13:00', 'Hannah', 'Bella'],
    ['2026-09-15', '14:00', 'Hannah', 'Kübra'],
    ['2026-09-15', '15:00', 'Hannah', 'Ceyda'],
    ['2026-09-15', '13:00', 'Helen', 'Hale'],
  ], 'Hannah first (her 11:00 is booked, 10:00 is under the notice); the DUE ones first, most recent visit first, and Ceyda the pull-forward only when they are used up; Hale the wax customer waits for Helen\'s first free hour after her 11–13 run');
  is(plan.offers.map(o => o.why), ['son ziyaret 21 gün önce', 'son ziyaret 26 gün önce', 'son ziyaret 35 gün önce', 'randevusu 2026-09-19 — öne alınabilir', 'son ziyaret 20 gün önce'], 'each offer says why she was picked');
  {
    // The pull-forward is a fallback, never a preference: with the due ones
    // gone, she is used; with a due customer available, she is not.
    const noDue = { appointments: appointments.filter(a => [3, 4].includes(a.clientId)), clients };
    const p = api.gfPlan({ data: noDue, offers: {}, optout, cfg, nowMs: NOW, todayYmd: TODAY, nowMin: 600 });
    is(p.offers.map(o => [o.t, o.name]), [['12:00', 'Ceyda']], 'nobody due → the pull-forward takes the first slot');
    const oneDue = { appointments: appointments.filter(a => [1, 3, 4].includes(a.clientId)), clients };
    const q = api.gfPlan({ data: oneDue, offers: {}, optout, cfg, nowMs: NOW, todayYmd: TODAY, nowMin: 600 });
    is(q.offers.map(o => [o.t, o.name]), [['12:00', 'Ayşe'], ['13:00', 'Ceyda']], 'one due customer → she takes the first slot, the pull-forward the next');
  }
  is(plan.offers.some(o => o.tech === 'Helen' && o.name === 'Bella'), false, 'the lash customer never goes to Helen');
  is(plan.offers.some(o => o.tech !== 'Helen' && o.name === 'Hale'), false, 'the wax customer goes to nobody but Helen');
  is(new Set(plan.offers.map(o => o.cid)).size, plan.offers.length, 'one customer, one offer per run');
  is(new Set(plan.offers.map(o => o.d + o.t + o.tech)).size, plan.offers.length, 'one slot, one customer');
  is(plan.offers[0].phone, '905331111111', 'the phone is the normalised 90… form');
  is(plan.unfilled.length > 30, true, 'the rest of the free hours have nobody to offer: ' + plan.unfilled.length);
  is(plan.expire, [], 'nothing to release');
  is(plan.booked, [], 'nothing to mark booked');
  is([plan.sentToday, plan.room], [0, 25], 'nothing sent today, 25 to spare');
}

console.log('3. who is left out');
{
  const { api } = makeWorker({});
  const cfg = api.gfConfig();
  const names = api.gfPlan({ data, offers: baseOffers, optout, cfg, nowMs: NOW, todayYmd: TODAY, nowMin: 600 }).offers.map(o => o.name);
  for (const [n, why] of [['KAPALI — Personel', 'the blocker'], ['Fatma', 'unusable phone'], ['Elif', '"mesaj istemiyor" in her notes'], ['Gül', 'her number in the opt-out map'], ['Deniz', 'visited 5 days ago and booked today — a booking BEFORE a gap is no reason to offer it'], ['İrem', '200 days — the win-back template\'s job'], ['Jale', 'offered 3 days ago — 7-day cooldown']]) {
    is(names.includes(n), false, n + ' is not offered: ' + why);
  }
  is(names.includes('Kübra'), true, 'Kübra, offered 8 days ago, is free to be offered again');
  is(api.gfOptedOut({ waOptOut: true }, '90', {}), true, 'the waOptOut flag');
  is(api.gfOptedOut({ notes: 'Please STOP' }, '90', {}), true, 'STOP in the notes');
  is(api.gfOptedOut({ notes: 'likes coffee' }, '905', { '905': {} }), true, 'the number in the map');
  is(api.gfOptedOut({ notes: 'likes coffee' }, '905', {}), false, 'a plain customer');
  is(api.gfOptedOut({ notes: 'non-stop talker' }, '905', {}), false, '"non-stop" is not an opt-out');
}

console.log('3b. one phone is one customer (the "Berin Avunduk" / "BERİN AVUNDUK" case)');
{
  const { api } = makeWorker({});
  const cfg = api.gfConfig();
  const twins = [
    { id: 21, name: 'Berin Avunduk', phone: '0548 836 4040' },
    { id: 22, name: 'BERİN AVUNDUK', phone: '905488364040' },
  ];
  const visits = [
    A(201, 21, 'Helen', daysAgo(17) + 'T10:00', 'Klasik Pedikür (Ojesiz)'),
    A(202, 22, 'Helen', daysAgo(30) + 'T10:00', 'Dolgu (Infill)'),
  ];
  const only = (extra) => ({ appointments: visits.concat(extra || []), clients: twins });
  const p = api.gfPlan({ data: only(), offers: {}, optout: {}, cfg, nowMs: NOW, todayYmd: TODAY, nowMin: 600 });
  is(p.offers.length, 1, 'two records, one phone → ONE offer per run, never two messages to one phone');
  is([p.offers[0].name, p.offers[0].cid, p.offers[0].service, p.offers[0].why], ['Berin Avunduk', '21', 'Klasik Pedikür (Ojesiz)', 'son ziyaret 17 gün önce'], 'named by the record with the most recent visit, and that visit\'s service');
  const q = api.gfPlan({ data: only([A(203, 22, 'Helen', '2026-09-16T10:00', 'Dolgu (Infill)')]), offers: {}, optout: {}, cfg, nowMs: NOW, todayYmd: TODAY, nowMin: 600 });
  is(q.offers.length, 0, 'a booking on the twin record within 3 days of every gap keeps HER out — the bookings pool');
  const prior = { 'x': { d: '2026-09-10', t: '10:00', tech: 'Helen', cid: '22', phone: '905488364040', ts: NOW - 2 * 86400e3, day: daysAgo(2), st: 'expired' } };
  const r = api.gfPlan({ data: only(), offers: prior, optout: {}, cfg, nowMs: NOW, todayYmd: TODAY, nowMin: 600 });
  is(r.offers.length, 0, 'an offer to the twin record two days ago is an offer to her: the cooldown holds by phone');
  const sameDay = { 'y': { d: TODAY, t: '17:00', tech: 'Helen', cid: '22', phone: '905488364040', ts: NOW - 10 * 86400e3, day: daysAgo(10), st: 'expired' } };
  const s = api.gfPlan({ data: only(), offers: sameDay, optout: {}, cfg, nowMs: NOW, todayYmd: TODAY, nowMin: 600 });
  is(s.offers[0] && s.offers[0].d, '2026-09-16', 'the same-day rule holds by phone too: she is offered tomorrow, not today');
  const booked = { 'z': { d: TODAY, t: '17:00', tech: 'Helen', cid: '21', phone: '905488364040', ts: NOW - 30 * 60e3, day: TODAY, st: 'offered' } };
  const t = api.gfPlan({ data: only([A(204, 22, 'Helen', TODAY + 'T17:00', 'Dolgu (Infill)')]), offers: booked, optout: {}, cfg, nowMs: NOW, todayYmd: TODAY, nowMin: 600 });
  is(t.booked, ['z'], 'she booked under the twin record: the offer is marked booked all the same');
}

console.log('3c. the cancelled route — she gave up a booking she wanted and has nothing now');
{
  const { api } = makeWorker({});
  const cfg = api.gfConfig();
  // Nur (id 31): came in Saturday the 12th (3 days ago), and on the 10th
  // cancelled the booking she held for the 20th. Nothing in the diary now.
  // The due window cannot see her — 3 days is not 10 — but she has said
  // she wants an hour.
  const nur = { id: 31, name: 'Nur', phone: '0533 313 1313' };
  const visit = A(901, 31, 'Helen', daysAgo(3) + 'T10:00', 'Klasik Manikür');
  const gaveUp = Object.assign(A(902, 31, 'Helen', '2026-09-20T10:00', 'Klasik Manikür'), { status: 'cancelled' });
  const row = (over) => Object.assign({ id: 'c1', apptId: 902, client: 'Nur', staff: 'Helen', service: 'Klasik Manikür', price: 900, apptTime: '2026-09-20T10:00', cancelledAt: new Date(NOW - 5 * 86400e3).toISOString(), by: 'Resepsiyon', reason: '' }, over || {});
  const run = (o) => {
    o = o || {};
    const d = { appointments: [visit, gaveUp].concat(o.appts || []), clients: [nur].concat(o.clients || []) };
    const c = o.cfg || cfg;
    return api.gfPlan({ data: d, offers: o.offers || {}, optout: o.optout || {}, cfg: c, cancels: o.cancels === undefined ? { items: [row(o.row)] } : o.cancels, nowMs: NOW, todayYmd: TODAY, nowMin: 600 });
  };
  const her = p => p.offers.filter(o => o.name === 'Nur');
  const noShows = Object.assign({}, cfg, { gap: Object.assign({}, cfg.gap, { offerNoShows: true }) });

  is(her(run({ cancels: { items: [] } })), [], 'without the cancel log she is invisible: visited 3 days ago is not due, and she holds nothing');
  const p = run();
  is(her(p).length, 1, 'with it she QUALIFIES — one offer');
  is(her(p)[0] && [her(p)[0].d, her(p)[0].t, her(p)[0].tech, her(p)[0].service], ['2026-09-15', '11:00', 'Hannah', 'Klasik Manikür'], 'the first free hour of the walk, her usual service');
  is(/iptal/.test(her(p)[0].why), true, 'and her why says iptal');
  is(her(p)[0].why, '10 Eyl iptal (20 Eyl randevusu)', 'in full: the day she cancelled and the appointment she gave up');
  is(her(p)[0].phone, '905333131313', 'her phone came through the appointment → clientId → client record');
  is(her(run({ cancels: [row()] })).length, 1, 'the log as a bare list reads the same');
  is(her(run({ cancels: { items: { k1: row() } } })).length, 1, '…and as an object of items, as Firebase may hand it back');
  is(her(run({ appts: [A(903, 31, 'Helen', '2026-09-25T10:00', 'Klasik Manikür')] })).filter(o => /iptal/.test(o.why)), [], 'the same woman with something booked ahead does NOT qualify on this route');
  is(her(run({ appts: [A(903, 31, 'Helen', '2026-09-25T10:00', 'Klasik Manikür')] })).map(o => o.why), ['randevusu 2026-09-25 — öne alınabilir'], '…she is only what she always was, a pull-forward for the 25th');
  is(her(run({ row: { cancelledAt: new Date(NOW - 20 * 86400e3).toISOString() } })), [], 'a cancellation older than cancelledWindowDays (20 > 14 days) does not');
  is(her(run({ row: { cancelledAt: new Date(NOW - 13 * 86400e3).toISOString() } })).length, 1, '…13 days ago still does');
  is(her(run({ row: { apptTime: '2026-09-08T10:00' } })), [], 'a row whose apptTime was already past when she cancelled does not — that hour was not wanted, it was gone');
  // REAL NOTICE: cancelMinNoticeHours (24). The salon clock is +3 in
  // September, so 07:00Z is 10:00 at the desk.
  is(her(run({ row: { apptTime: '2026-09-12T12:00', cancelledAt: '2026-09-11T07:00:00.000Z' } })).length, 1, 'cancelled 26 hours before the appointment — QUALIFIES');
  is(her(run({ row: { apptTime: '2026-09-12T09:00', cancelledAt: '2026-09-11T07:00:00.000Z' } })), [], 'cancelled 23 hours before — does NOT');
  is(her(run({ row: { apptTime: '2026-09-11T14:00', cancelledAt: '2026-09-11T07:00:00.000Z' } })), [], 'cancelled the same morning, 10:00 for a 14:00 — does NOT: she is not chased');
  is(her(run({ row: { apptTime: '2026-09-12T10:00', cancelledAt: '2026-09-11T07:00:00.000Z' } })).length, 1, 'exactly 24 hours — qualifies (the test is >=)');
  is(her(run({ row: { apptTime: '2026-09-12T09:59', cancelledAt: '2026-09-11T07:00:00.000Z' } })), [], 'a minute short of 24 hours — does not');
  const sameDayOk = Object.assign({}, cfg, { gap: Object.assign({}, cfg.gap, { cancelMinNoticeHours: 0 }) });
  is(her(run({ row: { apptTime: '2026-09-11T14:00', cancelledAt: '2026-09-11T07:00:00.000Z' }, cfg: sameDayOk })).length, 1, 'cancelMinNoticeHours 0 brings the same-morning canceller back in');
  is(her(run({ row: { apptTime: '2026-09-11T09:30', cancelledAt: '2026-09-11T07:00:00.000Z' }, cfg: sameDayOk })), [], '…but even at 0 an hour already gone (09:30 cancelled at 10:00) never counts — judged on the salon clock, not UTC');
  is(her(run({ row: { reason: 'gelmedi' } })), [], 'reason "gelmedi": NOT offered while offerNoShows is false');
  is(her(run({ row: { reason: 'Müşteri gelmedi, aramadı' } })), [], '…"gelmedi" anywhere in the reason');
  const ns = her(run({ row: { reason: 'gelmedi' }, cfg: noShows }));
  is(ns.length, 1, '…and IS offered when offerNoShows is true');
  is(ns[0].why, '10 Eyl gelmedi (20 Eyl randevusu)', '…with her why saying gelmedi, so the Gap Report is honest about it');
  is(her(run({ row: { reason: 'toplu kapatma — gelmedi' } })), [], 'a "toplu kapatma" row: never');
  is(her(run({ row: { reason: 'toplu kapatma — gelmedi' }, cfg: noShows })), [], '…whatever offerNoShows says');
  is(her(run({ row: { reason: 'Toplu Kapatma: eski randevular' }, cfg: noShows })), [], '…in any case, with anything after it');
  is(her(run({ row: { reason: 'müşteri vazgeçti' } })).length, 1, 'a plain reason is fine');
  // Everything else still bites.
  const offered3 = { 'x': { d: '2026-09-13', t: '10:00', tech: 'Lissa', cid: '31', phone: '905333131313', ts: NOW - 3 * 86400e3, day: daysAgo(3), st: 'expired' } };
  is(her(run({ offers: offered3 })), [], 'offered 3 days ago: the 7-day cooldown holds on this route too');
  is(her(run({ offers: { 'x': Object.assign({}, offered3.x, { ts: NOW - 8 * 86400e3, day: daysAgo(8) }) } })).length, 1, '…8 days ago: free again');
  is(her(run({ optout: { '905333131313': { ts: 1 } } })), [], 'her number in the opt-out map: nothing');
  is(her(run({ clients: [], appts: [], cancels: { items: [row({ client: 'KAPALI — Personel', apptId: 5555 })] } })), [], 'the blocker name never qualifies');
  is(her(run({ row: { service: 'Klasik Kirpik Uygulaması' } })).every(o => o.tech !== 'Helen'), true, 'the skill check: a lash cancellation never goes to Helen');
  is(her(run({ row: { service: 'Klasik Kirpik Uygulaması' } })).map(o => o.tech), ['Hannah'], '…Hannah takes her');
  is(her(run({ appts: [A(904, 31, 'Helen', daysAgo(1) + 'T10:00', 'Klasik Manikür')] })).map(o => o.d), ['2026-09-17'], 'she was in yesterday: the 3-day distance rule pushes her offer to Thursday');
  // Her phone is found PROPERLY, never guessed.
  const twin = { id: 32, name: 'Nur', phone: '0533 323 2323' };
  const q = run({ clients: [twin], row: { apptId: 999 } });
  is(her(q), [], 'apptId no longer resolves and two clients are called Nur: NO offer rather than a guessed phone');
  is(q.notes.some(n => /iptal kaydı atlandı: Nur — 2 müşteri aynı isimde/.test(n)), true, '…and the run says so');
  is(her(run({ row: { apptId: 999 } })).length, 1, 'apptId gone but exactly ONE client called Nur: resolved by name');
  is(her(run({ clients: [], appts: [], row: { apptId: 999, client: 'Kimse' } })), [], 'a name nobody carries: nothing');
  is(her(run({ clients: [twin], row: { apptId: 902 } })).map(o => o.phone), ['905333131313'], 'two Nurs but the apptId resolves: HER record, her phone, no ambiguity');
  // One phone is one customer here too, and the same-day rule holds.
  const sameDay = { 'y': { d: TODAY, t: '17:00', tech: 'Lissa', cid: '31', phone: '905333131313', ts: NOW - 10 * 86400e3, day: daysAgo(10), st: 'expired' } };
  is(her(run({ offers: sameDay })).map(o => o.d), ['2026-09-16'], 'offered something for today ten days ago: tomorrow, never the same day twice');
  // She comes FIRST — before the due.
  const full = api.gfPlan({ data: { appointments: appointments.concat([visit, gaveUp]), clients: clients.concat([nur]) }, offers: baseOffers, optout, cfg, cancels: { items: [row()] }, nowMs: NOW, todayYmd: TODAY, nowMin: 600 });
  is(full.offers[0] && [full.offers[0].name, full.offers[0].why], ['Nur', '10 Eyl iptal (20 Eyl randevusu)'], 'in the full diary she takes the first slot, ahead of Ayşe who is merely due');
  is(full.offers.slice(1).map(o => o.name), ['Ayşe', 'Bella', 'Kübra', 'Ceyda', 'Hale'], '…and the due and the pull-forward follow as before');
  // A woman whose ONLY booking was the one she cancelled — the pool has never heard of her.
  const only = api.gfPlan({ data: { appointments: [gaveUp], clients: [nur] }, offers: {}, optout: {}, cfg, cancels: { items: [row()] }, nowMs: NOW, todayYmd: TODAY, nowMin: 600 });
  is(only.offers.map(o => [o.name, o.why]), [['Nur', '10 Eyl iptal (20 Eyl randevusu)']], 'no visit ever, one cancelled booking: she still qualifies');
  // Two cancellations: the most recent one names the row.
  const two = run({ cancels: { items: [row(), row({ id: 'c2', apptId: 999, apptTime: '2026-09-22T10:00', cancelledAt: new Date(NOW - 2 * 86400e3).toISOString() })] } });
  is(her(two).map(o => o.why), ['13 Eyl iptal (22 Eyl randevusu)'], 'two rows for her: one offer, the most recent cancellation says why');
  // The runner passes the log through, and the dry run records the why.
  (async () => {
    const s = { 'rdns_gapfill_v1/control': null, 'rdns_main_v1': { appointments: [visit, gaveUp], clients: [nur] }, 'rdns_gapfill_v1/offers': {}, 'rdns_gapfill_v1/optout': {}, 'rdns_cancel_log_v1': { items: [row()] }, 'rdns_gapfill_v1/runs': {} };
    const w = makeWorker(s);
    const r = await w.api.runGapFiller({ FB_SECRET: 'sek', PIYZI_API_KEY: 'key', WA_GAPFILL: '' }, new Date(NOW), { preview: true });
    is(r.plan.offers.map(o => [o.name, o.why]), [['Nur', '10 Eyl iptal (20 Eyl randevusu)']], 'the runner reads rdns_cancel_log_v1 and the preview carries her why');
  })().catch(e => { fail++; console.log('  ✗ cancelled-route runner crashed: ' + e); });
}

console.log('4. the soft hold');
{
  const { api } = makeWorker({});
  const cfg = api.gfConfig();
  const offers = Object.assign({}, baseOffers, {
    'h-active': { d: '2026-09-15', t: '12:00', tech: 'Hannah', cid: '99', phone: '905330000099', ts: NOW - 30 * 60e3, day: TODAY, st: 'offered' },   // 30 min old: held
    'h-stale':  { d: '2026-09-15', t: '13:00', tech: 'Hannah', cid: '98', phone: '905330000098', ts: NOW - 3 * 3600e3, day: TODAY, st: 'offered' },  // 3 h old: released
    'h-booked': { d: '2026-09-15', t: '16:00', tech: 'Hannah', cid: '4', phone: '905334444444', ts: NOW - 30 * 60e3, day: TODAY, st: 'offered' },   // Deniz booked today: done
  });
  const plan = api.gfPlan({ data, offers, optout, cfg, nowMs: NOW, todayYmd: TODAY, nowMin: 600 });
  const hannahToday = plan.offers.filter(o => o.tech === 'Hannah' && o.d === TODAY).map(o => o.t);
  is(hannahToday.includes('12:00'), false, 'the slot under an active hold is offered to nobody else');
  is(hannahToday[0], '13:00', 'the stale hold\'s slot is free again and taken first');
  is(plan.expire, ['h-stale'], 'the stale hold is released');
  is(plan.booked, ['h-booked'], 'the offer whose customer now has a booking that day is marked booked');
  is(hannahToday.includes('16:00'), true, 'and its slot is not held either');
  is(plan.sentToday, 3, 'the three real offers of today count against the cap');
  is(plan.room, 22, '…leaving 22');
}

console.log('5. the daily cap');
{
  const { api } = makeWorker({});
  const cfg = api.gfConfig();
  const offers = {};
  for (let i = 0; i < 24; i++) offers['s' + i] = { d: '2026-09-16', t: '10:00', tech: 'Lissa', cid: 'z' + i, phone: '90533000' + String(i).padStart(4, '0'), ts: NOW - 3 * 3600e3, day: TODAY, st: i % 2 ? 'offered' : 'expired' };
  offers['f1'] = { d: '2026-09-16', t: '10:00', tech: 'Lissa', cid: 'zz', phone: '905330009999', ts: NOW - 3600e3, day: TODAY, st: 'failed' };   // reached nobody
  const plan = api.gfPlan({ data, offers, optout, cfg, nowMs: NOW, todayYmd: TODAY, nowMin: 600 });
  is([plan.sentToday, plan.room], [24, 1], '24 already out today (a failed one does not count) → room for 1');
  is(plan.offers.length, 1, 'exactly one offer planned');
  is(plan.notes.some(n => /günlük sınır 25 doldu/.test(n)), true, 'the cap is written into the notes');
  const cfg0 = api.gfConfig(Object.assign({}, REH, { gapFill: Object.assign({}, REH.gapFill, { dailyCap: 0 }) }));
  is(api.gfPlan({ data, offers: {}, optout, cfg: cfg0, nowMs: NOW, todayYmd: TODAY, nowMin: 600 }).offers, [], 'cap 0 → nothing');
}

console.log('6. notBefore');
{
  const { api } = makeWorker({});
  const cfg = api.gfConfig();
  const nowMs = Date.UTC(2026, 8, 11, 7, 0);   // Friday 11 Eylül, 10:00
  const plan = api.gfPlan({ data, offers: {}, optout, cfg, nowMs, todayYmd: '2026-09-11', nowMin: 600 });
  is(plan.offers.filter(o => o.tech === 'Hannah' && o.d < '2026-09-14'), [], 'on the 11th nothing of Hannah\'s dated before the 14th is offered');
  is(plan.notes.filter(n => /Hannah: 2026-09-14 öncesi teklif yok/.test(n)), ['2026-09-11 Hannah: 2026-09-14 öncesi teklif yok', '2026-09-12 Hannah: 2026-09-14 öncesi teklif yok'], 'said for the 11th and the 12th — NOT for the 14th');
  is(plan.notes.includes('2026-09-13: kapalı'), true, 'Sunday the 13th is closed');
  is(plan.offers.length > 0, true, 'Lissa and Helen still get their offers');
  // Her Monday hours ARE offered on the 11th, judged by the slot's date and
  // not the run's. Only Hannah on the roster, so the customers are not all
  // used up by Lissa and Helen on the Friday first.
  const onlyHannah = Object.assign({}, cfg, { fillOrderOn: ymd => cfg.fillOrderOn(ymd).filter(o => o.key === 'hannah') });
  const mon = api.gfPlan({ data, offers: {}, optout, cfg: onlyHannah, nowMs, todayYmd: '2026-09-11', nowMin: 600 });
  is(mon.offers.length > 0 && mon.offers.every(o => o.tech === 'Hannah' && o.d === '2026-09-14'), true, 'run on the 11th: her Monday-the-14th slots are offered (' + mon.offers.length + ' of them), nothing earlier');
  is(mon.offers.map(o => o.t).slice(0, 3), ['08:00', '09:00', '10:00'], 'from her first hour on Monday');
  const later = api.gfPlan({ data, offers: {}, optout, cfg, nowMs: NOW, todayYmd: TODAY, nowMin: 600 });
  is(later.offers[0].tech, 'Hannah', 'from the 14th on she is first, as fillOrder says');
}

console.log('6b. workdays: never Zara on a Tuesday, never Beyhan on a Monday');
{
  // Run on Monday 14 Eylül at 10:00 — the window is Pzt 14 … Cum 18, which
  // holds one of each: Zara's days are Pzt and Perş, Beyhan's Salı and Perş.
  // Enough due customers that every free hour of hers could be sold, so an
  // empty day is a day the roster refused, not a day nobody was due.
  const { api } = makeWorker({});
  const cfg = api.gfConfig();
  const monMs = Date.UTC(2026, 8, 14, 7, 0), MON = '2026-09-14';
  const ago = n => { const d = new Date(Date.UTC(2026, 8, 14) - n * 86400e3); return d.toISOString().slice(0, 10); };
  const pool = (from, svc, tech, count) => {
    const cl = [], ap = [];
    for (let i = 0; i < (count || 40); i++) {
      cl.push({ id: from + i, name: svc.slice(0, 4) + i, phone: '0533 ' + String(from + i).padStart(3, '0') + ' ' + String(1000 + i) });
      ap.push(A(from * 10 + i, from + i, tech, ago(20 + (i % 5)) + 'T10:00', svc));
    }
    return { clients: cl, appointments: ap };
  };
  const nails = pool(300, 'Klasik Manikür', 'Helen');
  const lashes = pool(400, 'Klasik Kirpik Uygulaması', 'Lissa');
  const both = { clients: nails.clients.concat(lashes.clients), appointments: nails.appointments.concat(lashes.appointments) };
  const only = key => Object.assign({}, cfg, { fillOrderOn: ymd => cfg.fillOrderOn(ymd).filter(o => o.key === key) });
  const dates = offers => [...new Set(offers.map(o => o.d))].sort();
  const wd = ymd => new Date(ymd + 'T12:00:00').getDay();

  const z = api.gfPlan({ data: both, offers: {}, optout: {}, cfg: only('zara'), nowMs: monMs, todayYmd: MON, nowMin: 600 });
  is(z.offers.length > 0 && z.offers.every(o => o.tech === 'Zara'), true, 'Zara alone on the roster: she gets offers (' + z.offers.length + ')');
  is(dates(z.offers), ['2026-09-14', '2026-09-17'], 'her offers fall on Pazartesi the 14th and Perşembe the 17th, no other day');
  is(z.offers.some(o => o.d === '2026-09-15'), false, 'Zara is NEVER offered a Tuesday');
  is(z.offers.every(o => [1, 4].includes(wd(o.d))), true, 'every one of her slots is on a weekday in her workdays [1, 4]');
  is(z.offers.every(o => o.service === 'Klasik Manikür'), true, 'and they are all manicure customers — no lash customer goes to Zara');

  const b = api.gfPlan({ data: both, offers: {}, optout: {}, cfg: only('beyhan'), nowMs: monMs, todayYmd: MON, nowMin: 600 });
  is(b.offers.length > 0 && b.offers.every(o => o.tech === 'Beyhan'), true, 'Beyhan alone on the roster: she gets offers (' + b.offers.length + ')');
  is(dates(b.offers), ['2026-09-15', '2026-09-17'], 'her offers fall on Salı the 15th and Perşembe the 17th, no other day');
  is(b.offers.some(o => o.d === MON), false, 'Beyhan is NEVER offered a Monday — not even the day the run happens');
  is(b.offers.every(o => [2, 4].includes(wd(o.d))), true, 'every one of her slots is on a weekday in her workdays [2, 4]');
  is(b.offers.every(o => o.service === 'Klasik Kirpik Uygulaması'), true, 'and they are all lash customers');
  const bn = api.gfPlan({ data: nails, offers: {}, optout: {}, cfg: only('beyhan'), nowMs: monMs, todayYmd: MON, nowMin: 600 });
  is(bn.offers, [], 'forty due manicure customers and only Beyhan free: NOBODY is offered — she is not a nail technician and nobody is substituted');

  // The full roster, the real fillOrder: the two rules hold inside a normal
  // run too. The cap is lifted to 200 for this one and the pool widened to
  // 120 of each, so the walk reaches Beyhan's Tuesday (Hannah and Lissa take
  // the lash customers first, as fillOrder says) — under the live cap of 25
  // the first three technicians' Monday would use every offer up.
  const wide = { clients: pool(300, 'Klasik Manikür', 'Helen', 120).clients.concat(pool(500, 'Klasik Kirpik Uygulaması', 'Lissa', 120).clients), appointments: pool(300, 'Klasik Manikür', 'Helen', 120).appointments.concat(pool(500, 'Klasik Kirpik Uygulaması', 'Lissa', 120).appointments) };
  const uncapped = c => Object.assign({}, c, { gap: Object.assign({}, c.gap, { dailyCap: 200 }) });
  const all = api.gfPlan({ data: wide, offers: {}, optout: {}, cfg: uncapped(cfg), nowMs: monMs, todayYmd: MON, nowMin: 600 });
  is(all.offers.filter(o => o.tech === 'Zara' && ![1, 4].includes(wd(o.d))), [], 'a full run never puts Zara on a day off');
  is(all.offers.filter(o => o.tech === 'Beyhan' && ![2, 4].includes(wd(o.d))), [], 'a full run never puts Beyhan on a day off');
  is(all.offers.filter(o => o.tech === 'Beyhan' && o.service !== 'Klasik Kirpik Uygulaması'), [], 'a full run never sends Beyhan a nail customer');
  is(all.offers.some(o => o.tech === 'Beyhan' && o.d === '2026-09-15'), true, 'and she does get lash customers on her Tuesday (' + all.offers.filter(o => o.tech === 'Beyhan').length + ' in all)');
  is(all.offers.some(o => o.tech === 'Zara' && o.d === MON), true, 'and Zara gets manicure customers on her Monday (' + all.offers.filter(o => o.tech === 'Zara').length + ' in all)');
  // Under the LIVE cap the rules are the same, only fewer offers.
  const capped = api.gfPlan({ data: both, offers: {}, optout: {}, cfg, nowMs: monMs, todayYmd: MON, nowMin: 600 });
  is([capped.offers.length, capped.offers.filter(o => (o.tech === 'Zara' && ![1, 4].includes(wd(o.d))) || (o.tech === 'Beyhan' && ![2, 4].includes(wd(o.d)))).length], [25, 0], 'the live run: 25 offers, none of them Zara or Beyhan on a day off');

  // FAIL OPEN: a malformed workdays value on Zara's line puts her on every
  // day, Tuesday included — a typo widens her, never deletes her.
  const typo = loadCrown(); typo.operators.find(o => o.key === 'zara').workdays = 'Salı';
  const tcfg = uncapped(api.gfConfig(typo));
  const tz = api.gfPlan({ data: wide, offers: {}, optout: {}, cfg: Object.assign({}, tcfg, { fillOrderOn: ymd => tcfg.fillOrderOn(ymd).filter(o => o.key === 'zara') }), nowMs: monMs, todayYmd: MON, nowMin: 600 });
  is(dates(tz.offers), ['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18'], "workdays: 'Salı' (a typo) — she is offered every day of the window, the rule failed open");
  is(['2026-09-14', '2026-09-15', '2026-09-16', '2026-09-17', '2026-09-18'].map(d => tcfg.fillOrderOn(d).some(o => o.key === 'zara')), [true, true, true, true, true], '…and fillOrderOn lists her every day');
  const typo2 = loadCrown(); typo2.operators.find(o => o.key === 'beyhan').workdays = [];
  is(['2026-09-14', '2026-09-15', '2026-09-16'].map(d => api.gfConfig(typo2).fillOrderOn(d).some(o => o.key === 'beyhan')), [true, true, true], 'workdays: [] on Beyhan — every day, she is never silently deleted');
}

console.log('7. the distance rule and the same-day rule');
{
  const { api } = makeWorker({});
  const cfg = api.gfConfig();
  // Only Ceyda (booked on the 19th) in the diary, and the salon shut until the 17th.
  const only3 = { appointments: appointments.filter(a => a.clientId === 3), clients };
  const shut = Object.assign({}, cfg, { isClosed: ymd => ymd < '2026-09-17' || cfg.isClosed(ymd) });
  is(api.gfPlan({ data: only3, offers: {}, optout, cfg: shut, nowMs: NOW, todayYmd: TODAY, nowMin: 600 }).offers, [], 'a gap 2 or 1 days before her booking is never offered to her');
  const moved = { appointments: only3.appointments.map(a => a.id === 104 ? Object.assign({}, a, { datetime: '2026-09-20T10:00' }) : a), clients };
  const p2 = api.gfPlan({ data: moved, offers: {}, optout, cfg: shut, nowMs: NOW, todayYmd: TODAY, nowMin: 600 });
  is(p2.offers.map(o => [o.d, o.name]), [['2026-09-17', 'Ceyda']], 'three days before it, she is — the fill-call list\'s own rule');
  // Ayşe was offered something for the 15th ten days ago: cooldown is over, but never the same day twice.
  const offers = { 'old-ayse': { d: TODAY, t: '17:00', tech: 'Lissa', cid: '1', phone: '905331111111', ts: NOW - 10 * 86400e3, day: daysAgo(10), st: 'expired' } };
  const p3 = api.gfPlan({ data, offers, optout, cfg, nowMs: NOW, todayYmd: TODAY, nowMin: 600 });
  const ayse = p3.offers.find(o => o.name === 'Ayşe');
  is(ayse && ayse.d, '2026-09-16', 'Ayşe is offered tomorrow instead of today');
}

console.log('8. the runner');
{
  const store = () => ({ 'rdns_gapfill_v1/control': null, 'rdns_main_v1': data, 'rdns_gapfill_v1/offers': baseOffers, 'rdns_gapfill_v1/optout': optout, 'rdns_gapfill_v1/runs': { '1': true } });
  const env = { FB_SECRET: 'sek', PIYZI_API_KEY: 'key', WA_GAPFILL: '' };
  (async () => {
    // dry run
    {
      const w = makeWorker(store());
      const r = await w.api.runGapFiller(env, new Date(NOW), { gapMs: 0 });
      is([r.ok, r.mode], [true, 'dry'], 'a dry run completes');
      is(w.calls.some(c => c.url.includes('api.piyzi.com')), false, 'NOTHING is sent to Piyzi');
      is(w.calls.filter(c => c.url.includes('/offers/') && c.method !== 'GET').length, 0, 'no offer is written');
      const rec = w.calls.find(c => c.method === 'PUT' && c.url.includes('/rdns_gapfill_v1/runs/'));
      is(!!rec, true, 'the run is recorded');
      is([rec.body.mode, rec.body.offers.length, rec.body.sent, rec.body.result], ['dry', 5, 0, 'dry-run — nothing sent'], 'with what it WOULD have sent');
      is(rec.body.offers[0], { d: '2026-09-15', t: '12:00', tech: 'Hannah', cid: '1', name: 'Ayşe', phone: '905331111111', service: 'Klasik Manikür', why: 'son ziyaret 21 gün önce' }, 'each would-be offer in full');
      is(w.calls.filter(c => c.method === 'GET').map(c => c.url.replace(/^.*firebaseio\.com\//, '').replace(/\?.*$/, '')), ['rdns_gapfill_v1/control.json', 'rdns_main_v1.json', 'rdns_gapfill_v1/offers.json', 'rdns_gapfill_v1/optout.json', 'rdns_cancel_log_v1.json', 'rdns_gapfill_v1/runs.json'], 'reads: the pause flag, the diary, the offers, the opt-outs, the cancel log, then the run list to prune');
      is(w.calls.every(c => !c.url.includes('firebaseio') || /auth=sek/.test(c.url)), true, 'every Firebase call carries the secret');
      is(w.logs.filter(l => /WOULD SEND/.test(l)).length, 5, 'and wrangler tail shows the five WOULD SEND lines');
      const pv = makeWorker(store());
      const p = await pv.api.runGapFiller(env, new Date(NOW), { preview: true });
      is([p.ok, p.plan.offers.length, pv.calls.filter(c => c.method !== 'GET').length], [true, 5, 0], 'preview: the plan, and not one write');
    }
    // switched off
    {
      const w = makeWorker(store(), { crown: Object.assign({}, REH, { gapFill: Object.assign({}, REH.gapFill, { enabled: false }) }) });
      const r = await w.api.runGapFiller(env, new Date(NOW));
      is([r.ok, r.skipped, w.calls.length], [true, 'disabled', 0], 'enabled=false: reads nothing, writes nothing');
    }
    // paused from the panel
    {
      const s = store(); s['rdns_gapfill_v1/control'] = { paused: true };
      const w = makeWorker(s);
      const r = await w.api.runGapFiller(env, new Date(NOW));
      is([r.ok, r.skipped, w.calls.length], [true, 'paused', 1], 'paused: one read (the flag) and out');
    }
    // no secret
    {
      const w = makeWorker(store());
      const r = await w.api.runGapFiller({ PIYZI_API_KEY: 'key' }, new Date(NOW));
      is([r.ok, r.error, w.calls.length], [false, 'NO_FB_SECRET', 0], 'no FB_SECRET: aborts before touching anything');
    }
    // live, template not configured
    const LIVE = Object.assign({}, REH, { gapFill: Object.assign({}, REH.gapFill, { dryRun: false }) });
    {
      const w = makeWorker(store(), { crown: LIVE });
      const r = await w.api.runGapFiller(env, new Date(NOW), { gapMs: 0 });
      is([r.ok, r.mode, w.calls.some(c => c.url.includes('api.piyzi.com'))], [true, 'live', false], 'live with WA_GAPFILL empty: nothing sent');
      is(/TEMPLATES_NOT_CONFIGURED/.test(r.run.result), true, 'and the run record says why');
      is(w.calls.filter(c => c.url.includes('/offers/') && c.method !== 'GET').length, 0, 'no offer written');
    }
    // live, sending
    {
      const spec = '{"templateName":"pyz_yerimiz_acildi_v1","languageCode":"tr","body":[]}';
      const w = makeWorker(store(), { crown: LIVE, piyziFail: b => b.phone === '905339999999' });
      const r = await w.api.runGapFiller(Object.assign({}, env, { WA_GAPFILL: spec }), new Date(NOW), { gapMs: 0 });
      const piyzi = w.calls.filter(c => c.url.includes('api.piyzi.com'));
      is(piyzi.length, 5, 'five sends');
      is(piyzi[0].body, { phone: '905331111111', templateName: 'pyz_yerimiz_acildi_v1', languageCode: 'tr', parameters: {} }, 'the fixed template, no parameters, to the normalised number');
      is([r.run.sent, r.run.failed, r.run.result], [4, 1, '4 sent, 1 failed'], 'Hale\'s refused send is counted as failed');
      const claims = w.calls.filter(c => c.method === 'PUT' && c.url.includes('/offers/'));
      is(claims.length, 5, 'each offer is claimed in the log');
      is(claims[0].body.st, 'sending', 'as "sending"…');
      is(w.calls.indexOf(claims[0]) < w.calls.indexOf(piyzi[0]), true, '…BEFORE its send goes out');
      const marks = w.calls.filter(c => c.method === 'PATCH' && c.url.includes('/offers/')).map(c => c.body.st);
      is(marks, ['offered', 'offered', 'offered', 'offered', 'failed'], 'then marked offered, or failed');
      is(w.calls.filter(c => c.method === 'PATCH' && c.url.includes('/offers/'))[0].body.uid, 'uid-' + (w.calls.indexOf(piyzi[0]) + 1), 'the message uid is kept');
      is(claims[0].body.day, TODAY, 'stamped with the salon day, which is what the cap counts');
      const rec = w.calls.find(c => c.method === 'PUT' && c.url.includes('/rdns_gapfill_v1/runs/'));
      is([rec.body.mode, rec.body.sent], ['live', 4], 'the run record says live, 4 sent');
      is(w.calls.some(c => c.url.includes('rdns_wa_log_v1')), true, 'each send also leaves a line in the WhatsApp log');
    }
    // live, the day-naming template: {day} becomes bugün / yarın / the weekday
    {
      const spec = '{"templateName":"bosluk_gun","languageCode":"tr","body":["{day}"]}';
      const w = makeWorker(store(), { crown: LIVE });
      await w.api.runGapFiller(Object.assign({}, env, { WA_GAPFILL: spec }), new Date(NOW), { gapMs: 0 });
      const piyzi = w.calls.filter(c => c.url.includes('api.piyzi.com'));
      const claims = w.calls.filter(c => c.method === 'PUT' && c.url.includes('/offers/'));
      is(piyzi.length > 0, true, 'bosluk_gun: offers go out');
      is(piyzi.every(c => c.body.templateName === 'bosluk_gun' && Array.isArray(c.body.parameters.body) && c.body.parameters.body.length === 1), true, 'bosluk_gun: exactly one body value each');
      is(piyzi.map(c => c.body.parameters.body[0]), claims.map(c => w.api.gfDayWord(c.body.d, TODAY)), 'bosluk_gun: each names its own slot\'s day');
      const wd = w.api.gfDayWord;
      is([wd('2026-09-15','2026-09-15'), wd('2026-09-16','2026-09-15'), wd('2026-09-17','2026-09-15'), wd('2026-09-19','2026-09-15'), wd('2026-10-01','2026-09-30')],
         ['bugün', 'yarın', 'Perşembe', 'Cumartesi', 'yarın'], 'gfDayWord: today, tomorrow, weekdays, across a month end');
    }
    // housekeeping on a live run: stale holds released, booked spotted
    {
      const s = store();
      s['rdns_gapfill_v1/offers'] = Object.assign({}, baseOffers, {
        'h-stale': { d: TODAY, t: '13:00', tech: 'Hannah', cid: '98', phone: '905330000098', ts: NOW - 3 * 3600e3, day: TODAY, st: 'offered' },
        'h-booked': { d: TODAY, t: '16:00', tech: 'Hannah', cid: '4', phone: '905334444444', ts: NOW - 30 * 60e3, day: TODAY, st: 'offered' },
        'ancient': { d: '2026-06-01', t: '10:00', tech: 'Lissa', cid: '77', phone: '905330000077', ts: NOW - 70 * 86400e3, day: '2026-06-01', st: 'expired' },
      });
      s['rdns_gapfill_v1/runs'] = Object.fromEntries(Array.from({ length: 33 }, (_, i) => [String(1000 + i), true]));
      const w = makeWorker(s);
      await w.api.runGapFiller(env, new Date(NOW), { gapMs: 0 });
      const patches = w.calls.filter(c => c.method === 'PATCH').map(c => [c.url.replace(/^.*\/offers\//, '').replace(/\.json.*$/, ''), c.body.st]);
      is(patches, [['h-stale', 'expired'], ['h-booked', 'booked']], 'the stale hold is released and the booked one marked, in a dry run too');
      const dels = w.calls.filter(c => c.method === 'DELETE').map(c => c.url.replace(/^.*rdns_gapfill_v1\//, '').replace(/\.json.*$/, ''));
      is(dels, ['runs/1000', 'runs/1001', 'runs/1002', 'runs/1003', 'offers/ancient'], 'the oldest runs beyond 30 and the 70-day-old offer are pruned');
    }

    console.log('9. the cron and the dispatch');
    {
      const toml = fs.readFileSync(path.join(__dirname, '..', 'worker', 'wrangler.toml'), 'utf8');
      const src = fs.readFileSync(path.join(__dirname, '..', 'worker', 'src', 'index.js'), 'utf8');
      is(/crons = \["0 3 \* \* \*", "0 4 \* \* \*", "0 6-17 \* \* 1-6"\]/.test(toml), true, 'the hourly Mon–Sat cron sits beside the two morning ones (to 17Z since 15 Eylül 2026: the 19:00 review ask needs the extra winter tick)');
      is(/^WA_GAPFILL = '\{"templateName":"bosluk_teklifi","languageCode":"tr","body":\[\]\}'$/m.test(toml), true, 'WA_GAPFILL names the approved template bosluk_teklifi, tr, no variables');
      is(/if \(h === 6\) \{[\s\S]*?await sendMorningReminders\(env\);[\s\S]*?\}\s*if \(h >= 9 && h <= 18\) await runGapFiller\(env, when\);/.test(src), true, 'the scheduled handler: six o\'clock → reminders, nine to six → the gap-filler, else nothing');
      is(/^import '\.\.\/\.\.\/crown-config\.js';/m.test(src), true, 'crown-config.js is imported into the worker');
      is(/route === '\/wa\/gapfill-preview'/.test(src) && /route === '\/wa\/gapfill-run'/.test(src), true, 'the preview and run routes exist for the panel');
      is(fs.existsSync(path.join(__dirname, '..', 'worker', 'templates', 'gapfill-offer.md')), true, 'the offer template is written down for Meta');
    }

    console.log('');
    console.log(fail ? `✗ ${fail} FAILED, ${pass} passed` : `✓ all ${pass} passed`);
    process.exit(fail ? 1 : 0);
  })().catch(e => { console.error('✗ test crashed:', e); process.exit(1); });
}
