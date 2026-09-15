// ═══════════════════════════════════════════════════════════════════════════
// The automatic Google review request — the REAL planner and runner out of
// worker/src/index.js (raConfig, raPlan, runReviewAsk), with the REAL
// crown-config.js, run against a small diary and a recording stub for
// fetch. No network, no Piyzi, no key.
//
//   1. the settings, as crown-config.js has them TODAY: live (dry run OFF
//      since 15 Eylül 2026), enabled, cap 15, hour 19, 3 days back,
//      180-day cooldown; and the safe readings of a broken config. Every
//      other section runs on REH — the same config with dry run ON — so the
//      rehearsal keeps its numbers whatever Bülent sets the live switch to.
//   2. who is asked: completed, in the window, sat 'happy', a phone
//   3. who is not: 'unhappy', 'not_asked', a MISSING sat (nobody chased
//      retroactively), not completed, outside the window, no client, no
//      phone, KAPALI, opted out (notes / the gap-filler's map), asked in the
//      last 180 days by the worker (by id AND by phone) or by the dashboard
//      card, the cap — each with its reason in the run record
//   4. one phone is one customer; an unhappy visit yesterday and a happy one
//      today asks her; the oldest visit in the window goes first
//   5. the runner: dry run reads, records, sends NOTHING; enabled=false
//      reads nothing; paused stops it; live without a template sends
//      nothing and says TEMPLATES_NOT_CONFIGURED; live sends, claiming
//      each ask first; a RE-RUN the same evening sends nobody twice
//   6. the cron line, WA_REVIEW and the dispatch at the salon's 19:00
//
// Run:  node tests/review-ask.test.js
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
const REH = Object.assign({}, C, { reviewAsk: Object.assign({}, C.reviewAsk, { dryRun: true, dailyCap: 15 }) });
const withRa = (base, over) => Object.assign({}, base, { reviewAsk: Object.assign({}, base.reviewAsk, over) });

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
    // Writes land in the store as they would in Firebase, so a second run sees the first one's claims.
    const sm = p.match(/^rdns_review_v1\/sent\/([^/]+)$/);
    if (sm && method === 'PUT') (store['rdns_review_v1/sent'] = store['rdns_review_v1/sent'] || {})[sm[1]] = Object.assign({}, body);
    if (sm && method === 'PATCH') Object.assign((store['rdns_review_v1/sent'] = store['rdns_review_v1/sent'] || {})[sm[1]] = store['rdns_review_v1/sent'][sm[1]] || {}, body);
    const rm = method === 'PUT' && p.match(/^rdns_review_v1\/runs\/(\d+)$/);
    if (rm) (store['rdns_review_v1/runs'] = store['rdns_review_v1/runs'] || {})[rm[1]] = true;
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
    '\n;__api = { raConfig, raPlan, runReviewAsk, waPhone };', ctx, { filename: 'worker-slice.js' });
  return { api: ctx.__api, calls, logs };
}

// ── the diary: Tuesday 15 Eylül 2026, 19:00 at the salon ─────────────────
const NOW = Date.UTC(2026, 8, 15, 16, 0);     // 19:00 Nicosia (summer, +3)
const TODAY = '2026-09-15';
const D = 86400e3;
const clients = [
  { id: 1, name: 'Ayşe', phone: '0533 111 1111' },                            // happy today → asked
  { id: 2, name: 'Bella', phone: '0533 222 2222' },                           // happy on the 13th → asked (oldest first)
  { id: 3, name: 'Ceyda', phone: '0533 333 3333' },                           // unhappy → not
  { id: 4, name: 'Derya', phone: '0533 444 4444' },                           // not_asked → not
  { id: 5, name: 'Ebru', phone: '0533 555 5555' },                            // sat missing → not
  { id: 6, name: 'Filiz', phone: '0533 666 6666' },                           // happy on the 12th → outside the window
  { id: 7, name: 'Gül', phone: '' },                                          // no phone
  { id: 8, name: 'KAPALI — Personel', phone: '0533 888 8888' },               // the blocker
  { id: 9, name: 'Hale', phone: '0533 999 9999', notes: 'STOP dedi' },        // opted out in her notes
  { id: 10, name: 'Irmak', phone: '0533 101 0101' },                          // opted out on the map
  { id: 11, name: 'Jale', phone: '0533 111 1112', reviewAskedTs: NOW - 10 * D }, // the dashboard card asked her by hand
  { id: 12, name: 'Kader', phone: '0533 121 2121' },                          // the worker asked her 100 days ago (by id)
  { id: 13, name: 'Lale', phone: '0533 131 3131' },                           // the worker asked her PHONE 100 days ago under another record
  { id: 14, name: 'Melek', phone: '0533 141 4141' },                          // the worker asked her 181 days ago → asked again
  { id: 15, name: 'Nur', phone: '0533 151 5151' },                            // unhappy yesterday, happy today → asked
  { id: 16, name: 'NUR', phone: '0533 151 5151' },                            // the same woman, typed again in capitals — one phone
  { id: 17, name: 'Oya', phone: '0533 171 7171' },                            // not completed
];
let seq = 100;
const visit = (cid, day, sat, over) => Object.assign({ id: ++seq, clientId: cid, datetime: day + 'T11:00', status: 'completed', service: 'Klasik Manikür', sat }, over || {});
const appointments = [
  visit(1, TODAY, 'happy'),
  visit(2, '2026-09-13', 'happy'),
  visit(3, TODAY, 'unhappy'),
  visit(4, TODAY, 'not_asked'),
  visit(5, TODAY, undefined),
  visit(6, '2026-09-12', 'happy'),
  visit(7, TODAY, 'happy'),
  visit(8, TODAY, 'happy'),
  visit(9, TODAY, 'happy'),
  visit(10, TODAY, 'happy'),
  visit(11, TODAY, 'happy'),
  visit(12, TODAY, 'happy'),
  visit(13, TODAY, 'happy'),
  visit(14, TODAY, 'happy'),
  visit(15, '2026-09-14', 'unhappy'),
  visit(15, TODAY, 'happy'),
  visit(16, TODAY, 'happy'),
  visit(17, TODAY, 'happy', { status: 'confirmed' }),
  visit(99, TODAY, 'happy'),                                                  // no client record
  { id: 999, clientId: 1, datetime: 'yarın', status: 'completed', sat: 'happy' } // a broken datetime never throws
];
const data = { appointments, clients };
const baseSent = {
  'k-old': { cid: '12', phone: '905331212121', ts: NOW - 100 * D, day: '2026-06-07', st: 'sent' },
  'l-old': { cid: '77', phone: '905331313131', ts: NOW - 100 * D, day: '2026-06-07', st: 'sent' },
  'm-older': { cid: '14', phone: '905331414141', ts: NOW - 181 * D, day: '2026-03-18', st: 'sent' },
  'x-failed': { cid: '1', phone: '905331111111', ts: NOW - 2 * D, day: '2026-09-13', st: 'failed' }  // reached nobody; holds nobody back
};
const optout = { '905331010101': { ts: 1, name: 'Irmak' } };
const cfgOf = crown => makeWorker({}, { crown }).api.raConfig(crown);
const planOf = (crown, over) => makeWorker({}, { crown }).api.raPlan(Object.assign({ data, sent: baseSent, optout, cfg: cfgOf(crown), nowMs: NOW, todayYmd: TODAY }, over || {}));

console.log('1. the settings');
{
  is(cfgOf(C), { enabled: true, dryRun: false, dailyCap: 15, sendHourLocal: 19, lookbackDays: 3, cooldownDays: 180 }, 'crown-config.js today: LIVE (dry run off since 15 Eylül 2026), enabled, cap 15, 19:00, 3 days back, 180-day cooldown');
  is(cfgOf(Object.assign({}, C, { reviewAsk: undefined })), { enabled: true, dryRun: true, dailyCap: 15, sendHourLocal: 19, lookbackDays: 3, cooldownDays: 180 }, 'no reviewAsk block at all → the defaults, with dry run ON');
  is(cfgOf(withRa(C, { dryRun: 'no', dailyCap: 'lots', sendHourLocal: 'evening', lookbackDays: 0 })), { enabled: true, dryRun: true, dailyCap: 0, sendHourLocal: 0, lookbackDays: 1, cooldownDays: 180 }, 'nonsense: dry run ON, cap 0 (nothing sent), hour 0 (no cron fires then), at least one day back');
}

console.log('2. who is asked');
{
  const p = planOf(REH);
  is(p.asks.map(a => a.name), ['Bella', 'Ayşe', 'Melek', 'Nur'], 'Bella (the 13th, oldest first), Ayşe (today), Melek (asked 181 days ago), Nur (unhappy yesterday, happy today) — and nobody else');
  is(p.asks[1], { cid: '1', name: 'Ayşe', phone: '905331111111', service: 'Klasik Manikür', d: TODAY, apptId: '101', why: 'bugün çıkışta 😊 memnun' }, 'each ask in full: the normalised phone, the visit day, the appointment id, the why');
  is(p.asks[0].why, '2 gün önce çıkışta 😊 memnun', "Bella's why counts the days");
  is([p.looked, p.sentToday, p.room], [17, 0, 15], '17 completed visits in the window looked at (the 12th, the unfinished one and the broken date are not visits); nothing sent today; room for 15');
}

console.log('3. who is not, and why');
{
  const p = planOf(REH);
  const why = name => (p.skipped.filter(s => s.name === name).map(s => s.why));
  is(why('Ceyda'), ['memnun değil'], "sat 'unhappy' → left out, and the run record says so");
  is(why('Derya'), ['çıkışta sorulmadı'], "sat 'not_asked' → left out: the desk did not ask, so neither do we");
  is(why('Ebru'), ['memnuniyet kaydı yok'], 'sat MISSING → left out: nobody is chased retroactively');
  is(p.skipped.some(s => s.name === 'Filiz'), false, 'the 12th is outside a 3-day window: not even looked at');
  is(p.skipped.filter(s => s.cid === '99').map(s => s.why), ['müşteri kaydı yok'], 'no client record → left out');
  is(why('Gül'), ['geçerli telefon yok'], 'no phone → left out');
  is(why('KAPALI — Personel'), ['KAPALI'], 'the blocker → never');
  is(why('Hale'), ['mesaj istemiyor'], 'STOP in her notes → left out');
  is(why('Irmak'), ['mesaj istemiyor'], "her number under the gap-filler's optout map → left out: one STOP is a STOP for everything");
  is(why('Jale'), ['son 180 günde zaten istendi'], 'the dashboard card asked her by hand 10 days ago → left out');
  is(why('Kader'), ['son 180 günde zaten istendi'], 'the worker asked her 100 days ago (by client id) → left out');
  is(why('Lale'), ['son 180 günde zaten istendi'], '…and by PHONE, under a record the book no longer has → left out');
  is(why('Melek'), [], '181 days ago is past the cooldown → asked');
  is(p.skipped.some(s => s.name === 'Oya'), false, 'a booking that is not completed is not a visit');
  is(p.skipped.some(s => s.name === 'Ayşe'), false, "a 'failed' record from two days ago holds Ayşe back from nothing");
  // the cap
  const capped = planOf(withRa(REH, { dailyCap: 2 }));
  is(capped.asks.map(a => a.name), ['Bella', 'Ayşe'], 'cap 2 → the first two');
  is(capped.skipped.filter(s => s.why === 'günlük sınır doldu').map(s => s.name), ['Melek', 'Nur'], '…and the rest say the cap did it');
  const counted = planOf(withRa(REH, { dailyCap: 5 }), { sent: Object.assign({}, baseSent, { 't1': { cid: '50', phone: '905330000050', ts: NOW - 3600e3, day: TODAY, st: 'sent' }, 't2': { cid: '51', phone: '905330000051', ts: NOW - 3600e3, day: TODAY, st: 'sending' }, 't3': { cid: '52', phone: '905330000052', ts: NOW - 3600e3, day: TODAY, st: 'failed' } }) });
  is([counted.sentToday, counted.room, counted.asks.length], [2, 3, 3], "the day's log counts sent and sending, not failed: 2 today, room 3, 3 asks");
  is(planOf(withRa(REH, { dailyCap: 0 })).asks, [], 'cap 0 → nobody');
  // the cooldown edge
  is(planOf(withRa(REH, { cooldownDays: 200 })).asks.map(a => a.name), ['Bella', 'Ayşe', 'Nur'], 'cooldown 200 → Melek (181 days) is inside it again');
  // the window edge
  is(planOf(withRa(REH, { lookbackDays: 4 })).asks.map(a => a.name), ['Filiz', 'Bella', 'Ayşe', 'Melek', 'Nur'], 'lookback 4 → the 12th is in, and Filiz comes first');
  is(planOf(withRa(REH, { lookbackDays: 1 })).asks.map(a => a.name), ['Ayşe', 'Melek', 'Nur'], 'lookback 1 → today only');
}

console.log('4. one phone is one customer');
{
  const p = planOf(REH);
  is(p.asks.filter(a => a.phone === '905331515151').map(a => a.name), ['Nur'], 'Nur and NUR share one number → one ask, to the first record');
  is(p.skipped.filter(s => s.name === 'NUR').length, 0, '…and the twin is not even listed as skipped: she IS the same customer');
  is(p.skipped.filter(s => s.name === 'Nur').map(s => s.why), ['memnun değil'], "Nur's unhappy visit yesterday is recorded as such — the happy one today still asks her");
  const twin = planOf(REH, { sent: Object.assign({}, baseSent, { 'nur': { cid: '16', phone: '905331515151', ts: NOW - 5 * D, day: '2026-09-10', st: 'sent' } }) });
  is(twin.asks.some(a => a.phone === '905331515151'), false, 'an ask to the twin 5 days ago holds BOTH records back');
}

console.log('5. the runner');
{
  const store = () => ({ 'rdns_review_v1/control': null, 'rdns_main_v1': data, 'rdns_review_v1/sent': Object.assign({}, baseSent), 'rdns_gapfill_v1/optout': optout, 'rdns_review_v1/runs': { '1': true } });
  const env = { FB_SECRET: 'sek', PIYZI_API_KEY: 'key', WA_REVIEW: '' };
  (async () => {
    // dry run
    {
      const w = makeWorker(store());
      const r = await w.api.runReviewAsk(env, new Date(NOW), { gapMs: 0 });
      is([r.ok, r.mode], [true, 'dry'], 'a dry run completes');
      is(w.calls.some(c => c.url.includes('api.piyzi.com')), false, 'NOTHING is sent to Piyzi');
      is(w.calls.filter(c => c.url.includes('/sent/') && c.method !== 'GET').length, 0, 'no sent record is written');
      const rec = w.calls.find(c => c.method === 'PUT' && c.url.includes('/rdns_review_v1/runs/'));
      is(!!rec, true, 'the run is recorded');
      is([rec.body.mode, rec.body.asks.length, rec.body.skipped.length, rec.body.looked, rec.body.sent, rec.body.result], ['dry', 4, 12, 17, 0, 'dry-run — nothing sent'], 'with what it WOULD have sent, and every visit left out (12: the twin NUR is not a skip, she is the same customer)');
      is(rec.body.asks[1], { cid: '1', name: 'Ayşe', phone: '905331111111', service: 'Klasik Manikür', d: TODAY, apptId: '101', why: 'bugün çıkışta 😊 memnun' }, 'each would-be ask in full');
      is(w.calls.filter(c => c.method === 'GET').map(c => c.url.replace(/^.*firebaseio\.com\//, '').replace(/\?.*$/, '')), ['rdns_review_v1/control.json', 'rdns_main_v1.json', 'rdns_review_v1/sent.json', 'rdns_gapfill_v1/optout.json', 'rdns_review_v1/runs.json'], "reads: the pause flag, the diary, the sent log, the gap-filler's opt-outs, then the run list to prune");
      is(w.calls.every(c => !c.url.includes('firebaseio') || /auth=sek/.test(c.url)), true, 'every Firebase call carries the secret');
      is(w.logs.filter(l => /WOULD SEND/.test(l)).length, 4, 'and wrangler tail shows the four WOULD SEND lines');
      const pv = makeWorker(store());
      const p = await pv.api.runReviewAsk(env, new Date(NOW), { preview: true });
      is([p.ok, p.plan.asks.length, pv.calls.filter(c => c.method !== 'GET').length], [true, 4, 0], 'preview: the plan, and not one write');
    }
    // switched off
    {
      const w = makeWorker(store(), { crown: withRa(REH, { enabled: false }) });
      const r = await w.api.runReviewAsk(env, new Date(NOW));
      is([r.ok, r.skipped, w.calls.length], [true, 'disabled', 0], 'enabled=false: reads nothing, writes nothing');
    }
    // paused
    {
      const s = store(); s['rdns_review_v1/control'] = { paused: true };
      const w = makeWorker(s);
      const r = await w.api.runReviewAsk(env, new Date(NOW));
      is([r.ok, r.skipped, w.calls.length], [true, 'paused', 1], 'paused: one read (the flag) and out');
    }
    // no secret
    {
      const w = makeWorker(store());
      const r = await w.api.runReviewAsk({ PIYZI_API_KEY: 'key' }, new Date(NOW));
      is([r.ok, r.error, w.calls.length], [false, 'NO_FB_SECRET', 0], 'no FB_SECRET: aborts before touching anything');
    }
    // live, template not configured
    const LIVE = withRa(REH, { dryRun: false });
    {
      const w = makeWorker(store(), { crown: LIVE });
      const r = await w.api.runReviewAsk(env, new Date(NOW), { gapMs: 0 });
      is([r.ok, r.mode, w.calls.some(c => c.url.includes('api.piyzi.com'))], [true, 'live', false], 'live with WA_REVIEW empty: nothing sent');
      is(/TEMPLATES_NOT_CONFIGURED/.test(r.run.result), true, 'and the run record says why');
      is(w.calls.filter(c => c.url.includes('/sent/') && c.method !== 'GET').length, 0, 'no sent record written');
    }
    // live, sending — then the same evening again
    {
      const spec = '{"templateName":"pyz_google_yorum_istegi","languageCode":"tr","body":[]}';
      const s = store();
      const w = makeWorker(s, { crown: LIVE, piyziFail: b => b.phone === '905331414141' });
      const r = await w.api.runReviewAsk(Object.assign({}, env, { WA_REVIEW: spec }), new Date(NOW), { gapMs: 0 });
      const piyzi = w.calls.filter(c => c.url.includes('api.piyzi.com'));
      is(piyzi.length, 4, 'four sends');
      is(piyzi[0].body, { phone: '905332222222', templateName: 'pyz_google_yorum_istegi', languageCode: 'tr', parameters: {} }, 'the fixed template, no parameters, to the normalised number — Bella first');
      is([r.run.sent, r.run.failed, r.run.result], [3, 1, '3 sent, 1 failed'], "Melek's refused send is counted as failed");
      const claims = w.calls.filter(c => c.method === 'PUT' && c.url.includes('/sent/'));
      is(claims.length, 4, 'each ask is claimed in the sent log');
      is(claims[0].body.st, 'sending', 'as "sending"…');
      is(w.calls.indexOf(claims[0]) < w.calls.indexOf(piyzi[0]), true, '…BEFORE its send goes out');
      const marks = w.calls.filter(c => c.method === 'PATCH' && c.url.includes('/sent/')).map(c => c.body.st);
      is(marks, ['sent', 'sent', 'failed', 'sent'], 'then marked sent, or failed');
      is(w.calls.filter(c => c.method === 'PATCH' && c.url.includes('/sent/'))[0].body.uid, 'uid-' + (w.calls.indexOf(piyzi[0]) + 1), 'the message uid is kept');
      is([claims[0].body.day, claims[0].body.apptId, claims[0].body.cid], [TODAY, '102', '2'], 'stamped with the salon day (what the cap counts), the appointment and the client');
      const rec = w.calls.find(c => c.method === 'PUT' && c.url.includes('/rdns_review_v1/runs/'));
      is([rec.body.mode, rec.body.sent], ['live', 3], 'the run record says live, 3 sent');
      is(w.calls.some(c => c.url.includes('rdns_wa_log_v1')), true, 'each send also leaves a line in the WhatsApp log');
      // the re-run: the store now holds the claims
      const w2 = makeWorker(s, { crown: LIVE });
      const r2 = await w2.api.runReviewAsk(Object.assign({}, env, { WA_REVIEW: spec }), new Date(NOW + 3600e3), { gapMs: 0 });
      is(w2.calls.filter(c => c.url.includes('api.piyzi.com')).map(c => c.body.phone), ['905331414141'], 'an hour later: only Melek, whose send FAILED, is tried again — nobody is asked twice');
      is([r2.run.sentToday, r2.run.room], [3, 12], 'the three that went count against the cap');
      is(r2.run.skipped.filter(x => x.why === 'son 180 günde zaten istendi').map(x => x.name).sort(), ['Ayşe', 'Bella', 'Jale', 'Kader', 'Lale', 'Nur'], '…and the three say "already asked", beside the earlier ones');
    }
    // pruning
    {
      const s = store();
      s['rdns_review_v1/sent'] = Object.assign({}, baseSent, { 'ancient': { cid: '70', phone: '905330000070', ts: NOW - 215 * D, day: '2026-02-12', st: 'sent' }, 'kept': { cid: '71', phone: '905330000071', ts: NOW - 205 * D, day: '2026-02-22', st: 'sent' } });
      s['rdns_review_v1/runs'] = Object.fromEntries(Array.from({ length: 33 }, (_, i) => [String(1000 + i), true]));
      const w = makeWorker(s);
      await w.api.runReviewAsk(env, new Date(NOW), { gapMs: 0 });
      const dels = w.calls.filter(c => c.method === 'DELETE').map(c => c.url.replace(/^.*rdns_review_v1\//, '').replace(/\.json.*$/, ''));
      is(dels, ['runs/1000', 'runs/1001', 'runs/1002', 'runs/1003', 'sent/ancient'], 'the oldest runs beyond 30 and a sent record 215 days old are pruned; one 205 days old (inside cooldown + 30) is kept');
    }

    console.log('6. the cron, the template and the dispatch');
    {
      const toml = fs.readFileSync(path.join(__dirname, '..', 'worker', 'wrangler.toml'), 'utf8');
      const src = fs.readFileSync(path.join(__dirname, '..', 'worker', 'src', 'index.js'), 'utf8');
      is(/crons = \["0 3 \* \* \*", "0 4 \* \* \*", "0 6-17 \* \* 1-6"\]/.test(toml), true, 'the Mon–Sat line runs to 17Z: 19:00 at the salon is 16Z in summer and 17Z in winter');
      is(/^WA_REVIEW = '\{"templateName":"pyz_google_yorum_istegi","languageCode":"tr","body":\[\]\}'$/m.test(toml), true, 'WA_REVIEW names the approved template pyz_google_yorum_istegi, tr, no variables');
      is(/if \(h >= 9 && h <= 18\) await runGapFiller\(env, when\);\s*const ra = raConfig\(\);\s*if \(ra && h === ra\.sendHourLocal\) await runReviewAsk\(env, when\);/.test(src), true, 'the scheduled handler: after the gap-filler, the review ask at reviewAsk.sendHourLocal on the salon clock');
      is(/route === '\/wa\/review-preview'/.test(src) && /route === '\/wa\/review-run'/.test(src), true, 'the preview and run routes exist');
      is(/optout = \(await fbRead\(env, GF \+ '\/optout'\)\) \|\| \{\};\s*\/\/ the gap-filler's list/.test(src), true, "runReviewAsk reads the gap-filler's opt-out map, not one of its own");
    }

    console.log('');
    console.log(fail ? `✗ ${fail} FAILED, ${pass} passed` : `✓ all ${pass} passed`);
    process.exit(fail ? 1 : 0);
  })();
}
