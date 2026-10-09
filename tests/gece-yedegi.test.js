// ═══════════════════════════════════════════════════════════════════════════
// GECE YEDEĞİ — the Worker's nightly snapshot.  9 Ekim 2026.
//
// The salon HAD a nightly backup. At 22:00 the page built a .json and
// downloaded it. It last ran by itself on 16 TEMMUZ. It could not work: it
// needed the app open on some device at 22:00, and a browser will not save a
// file nobody clicked for. So when six deletions took 59 customers and 304
// bookings on 8 Ekim, the newest file to rebuild from was 24 Ağustos.
//
// Firebase keeps no history. The replacement therefore has to be taken by
// something that is awake when every laptop is shut, and kept somewhere that
// is not the database it is protecting.
//
// This file runs the REAL runBackup / ydList / ydGet / ydTtlDays out of
// worker/src/index.js against a fake Firebase and a fake KV. No network.
//
//   1. the retention ladder — which days are kept how long
//   2. a normal night: what is read, what is written, where
//   3. the file is EXACTLY what the existing restore screen takes
//   4. once a day: the second morning cron finds it already done
//   5. the refusals — no customers, no secret, no KV, too big
//   6. ⚠ THE TRIPWIRE — 702 → 655 is caught the next morning
//   7. reading it back: the list and one day's file
//   8. the cron dispatch — it runs before the salon opens, every day
//
// Çalıştırma:  node tests/gece-yedegi.test.js
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
const WSRC = fs.readFileSync(path.join(__dirname, '..', 'worker', 'src', 'index.js'), 'utf8');

// ── a Firebase that remembers, and a KV that remembers ───────────────────
function makeWorker(store, opts) {
  opts = opts || {};
  const calls = [], logs = [];
  const kv = opts.kv || {};
  const kvTtl = {};
  const RD_WA = opts.noKv ? undefined : {
    put: async (k, v, o) => { if (opts.kvThrow) throw new Error(opts.kvThrow); kv[k] = v; kvTtl[k] = o && o.expirationTtl; calls.push({ kv: 'put', k, bytes: v.length, ttl: kvTtl[k] }); },
    get: async k => { calls.push({ kv: 'get', k }); return Object.prototype.hasOwnProperty.call(kv, k) ? kv[k] : null; },
    delete: async k => { delete kv[k]; },
    list: async () => ({ keys: Object.keys(kv).map(name => ({ name })), list_complete: true })
  };
  const fetch = async (url, init) => {
    init = init || {};
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : null;
    const m = String(url).match(/firebaseio\.com\/(.+?)\.json/);
    const p = m ? decodeURIComponent(m[1]) : '';
    calls.push({ url: String(url), p, method, body });
    if (method === 'GET') {
      // Firebase serves any path under a key, and ?shallow=true returns the
      // keys with `true` under each — which for an array is its length.
      let v = null;
      if (Object.prototype.hasOwnProperty.call(store, p)) v = store[p];
      else {
        const parts = p.split('/');
        for (let i = parts.length - 1; i > 0; i--) {
          const root = parts.slice(0, i).join('/');
          if (!Object.prototype.hasOwnProperty.call(store, root)) continue;
          v = store[root];
          for (const seg of parts.slice(i)) { v = (v == null) ? null : v[seg]; }
          break;
        }
      }
      if (/shallow=true/.test(String(url)) && v && typeof v === 'object') {
        const sh = {}; for (const k of Object.keys(v)) sh[k] = true; v = sh;
      }
      return { ok: true, status: 200, json: async () => v, text: async () => JSON.stringify(v == null ? null : v) };
    }
    if (method === 'PUT') store[p] = body;
    if (method === 'PATCH') store[p] = Object.assign({}, store[p] || {}, body);
    if (method === 'DELETE') delete store[p];
    // keep the parent map in step, as Firebase would
    const sub = p.match(/^(rdns_yedek_v1\/gunler)\/([^/]+)$/);
    if (sub) {
      store[sub[1]] = store[sub[1]] || {};
      if (method === 'DELETE') delete store[sub[1]][sub[2]]; else store[sub[1]][sub[2]] = body;
    }
    return { ok: true, status: 200, json: async () => null, text: async () => '' };
  };
  const cut = WSRC.indexOf('\nexport {');
  const ctx = {
    console: { log: (...a) => logs.push(a.join(' ')), warn: () => {}, error: () => {} },
    TextEncoder, Intl, setTimeout, AbortSignal, fetch, Response: class {},
    R_PAGE: '', CROWN: opts.crown || C
  };
  vm.createContext(ctx);
  vm.runInContext(WSRC.slice(0, cut).replace(/^import .*$/gm, '') +
    '\n;__api = { runBackup, ydList, ydGet, ydTtlDays, ydDrop, nicosiaYmd, nicosiaHour };', ctx, { filename: 'worker-slice.js' });
  return { api: ctx.__api, calls, logs, kv, kvTtl, store, env: { FB_SECRET: 'sek', RD_WA } };
}

// ── the salon's data, as Firebase holds it ────────────────────────────────
const mkMain = n => ({
  _ts: 1, _by: 'dev',
  clients: Array.from({ length: n }, (_, i) => ({ id: i + 1, name: 'Müşteri ' + (i + 1), phone: '0533 000 00' + i })),
  appointments: Array.from({ length: n * 6 }, (_, i) => ({ id: 1000 + i, clientId: (i % n) + 1, datetime: '2026-10-08T11:00', status: 'completed' })),
  payments: []
});
const freshStore = (n) => ({
  'rdns_main_v1': mkMain(n == null ? 702 : n),
  'rdns_takings_v3': { _ts: 2, history: [{ date: '2026-10-08', ops: [{ name: 'Lissa', amount: 1900 }] }] },
  'rdns_monthly_costs_v3': { _ts: 3, kira: 40000 },
  'rdns_cancel_log_v1': { x: 1 },
  'rdns_rebook_v1': { y: 2 }
});
const FRI = new Date(Date.UTC(2026, 9, 9, 3, 0));    // 03:00Z Cuma = 06:00 Lefkoşa
const SUN = new Date(Date.UTC(2026, 9, 11, 3, 0));   // Pazar
const FIRST = new Date(Date.UTC(2026, 10, 1, 4, 0)); // 1 Kasım, 04:00Z (kış) = 06:00

console.log('1. the retention ladder');
{
  const w = makeWorker({});
  is(w.api.ydTtlDays('2026-10-09'), 21, 'an ordinary Friday → three weeks');
  is(w.api.ydTtlDays('2026-10-11'), 60, 'a Sunday → two months of weekly pictures');
  is(w.api.ydTtlDays('2026-11-01'), 400, 'the 1st of a month → a year of month-ends');
  is(w.api.ydTtlDays('2026-11-08'), 60, '…and the 1st beats nothing: 8 Kasım is a Sunday, still 60');
  is(w.api.ydTtlDays('2026-03-01'), 400, '1 Mart 2026 is a Sunday AND the 1st → the longer wins');
}

(async () => {

console.log('2. a normal night');
{
  const s = freshStore();
  const w = makeWorker(s);
  const r = await w.api.runBackup(w.env, FRI);
  is([r.ok, r.day, r.clients, r.appts], [true, '2026-10-09', 702, 4212], '702 customers and 4.212 bookings, stamped with the salon day');
  const reads = w.calls.filter(c => c.method === 'GET' && c.p).map(c => c.p);
  is(reads.slice(0, 6), ['rdns_yedek_v1/gunler/2026-10-09', 'rdns_main_v1', 'rdns_takings_v3', 'rdns_monthly_costs_v3',
                         'rdns_main_v1/clients', 'rdns_main_v1/appointments'],
     'reads: have we done today, then the diary, the till and the costs — then the two SHALLOW counts');
  is(w.calls.filter(c => /shallow=true/.test(String(c.url || ''))).map(c => c.p), ['rdns_main_v1/clients', 'rdns_main_v1/appointments'],
     '…and the counts are shallow, so the megabyte tree is never parsed twice');
  is(w.calls.every(c => !c.url || /auth=sek/.test(c.url)), true, 'every Firebase call carries the secret');
  const puts = w.calls.filter(c => c.kv === 'put');
  is(puts.length, 1, 'ONE write to Cloudflare — a different company to the one holding the live data');
  is([puts[0].k, puts[0].ttl], ['yedek:2026-10-09', 21 * 86400], '…keyed by the day, and it expires itself in three weeks');
  is(s['rdns_yedek_v1/son'].clients, 702, "Firebase keeps a one-line index so every screen can see the backup's state");
  is(s['rdns_yedek_v1/son'].ok, true, '…and that it worked');
  is(s['rdns_yedek_v1/gunler/2026-10-09'].day, '2026-10-09', '…and one line per day for the list');
  is(typeof s['rdns_yedek_v1/son'].bytes, 'number', '…with the size, so a shrinking file shows up');
  is(w.logs.some(l => /\[yedek\] 2026-10-09: 702 müşteri/.test(l)), true, 'wrangler tail says what was taken');
}
{
  const w = makeWorker(freshStore(), {});
  await w.api.runBackup(w.env, SUN);
  is(w.calls.find(c => c.kv === 'put').ttl, 60 * 86400, 'a Sunday snapshot is kept for two months');
  const w2 = makeWorker(freshStore(), {});
  await w2.api.runBackup(w2.env, FIRST);
  is(w2.calls.find(c => c.kv === 'put').ttl, 400 * 86400, "the 1st of November's is kept for over a year");
  is(w2.calls.find(c => c.kv === 'put').k, 'yedek:2026-11-01', '…and 04:00Z in winter is still 06:00 at the salon, so the day is right');
}

console.log('3. the file is what the restore screen already takes');
{
  const s = freshStore();
  const w = makeWorker(s);
  await w.api.runBackup(w.env, FRI);
  const file = JSON.parse(w.kv['yedek:2026-10-09']);
  // index.html refuses a file without BOTH of these.
  is([file.version, typeof file.rdns_takings], [2, 'string'], 'version 2 and rdns_takings — the two the importer checks before it will open a file');
  is(typeof file.rdns_main, 'string', 'rdns_main is a STRING, because that is what goes back into localStorage');
  is(typeof file.rdns_costs, 'string', '…and so are the monthly costs');
  is(JSON.parse(file.rdns_main).clients.length, 702, '…and it parses back to 702 customers');
  is(JSON.parse(file.rdns_main).clients[0].phone, '0533 000 000', '…with their telephone numbers, which is the part that cannot be retyped');
  is([file.studioName, file.kaynak, file.gun], ['Royal Diamond Nail Studio', 'worker', '2026-10-09'], 'and it says where it came from, so a file in Downloads is identifiable');
  is(Object.keys(file.ekler).sort(), ['rdns_cancel_log_v1', 'rdns_rebook_v1'], 'the smaller books ride along under ekler — the old importer ignores what it does not know');
  is(!!file.exportedAt, true, 'exportedAt, which is what the restore dialog shows before it overwrites anything');
}

console.log('4. once a day, whatever the cron does');
{
  const s = freshStore();
  const w = makeWorker(s);
  await w.api.runBackup(w.env, FRI);
  const w2 = makeWorker(s, { kv: w.kv });
  const r2 = await w2.api.runBackup(w2.env, new Date(Date.UTC(2026, 9, 9, 4, 0)));  // the 04:00Z cron, an hour later
  is([r2.ok, r2.skipped], [true, 'bugün zaten alındı'], 'the second morning cron finds it done and leaves');
  is(w2.calls.filter(c => c.kv === 'put').length, 0, '…without writing a thing');
  const w3 = makeWorker(s, { kv: w.kv });
  const r3 = await w3.api.runBackup(w3.env, new Date(Date.UTC(2026, 9, 9, 10, 0)), { force: true });
  is(r3.ok, true, '…but the "Şimdi yedekle" button forces one anyway');
}

console.log('5. the refusals');
{
  // THE IMPORTANT ONE. An empty read must never be written down as a backup:
  // that is how a good file from yesterday gets buried under the accident.
  const s = freshStore(0);
  const w = makeWorker(s);
  const r = await w.api.runBackup(w.env, FRI);
  is([r.ok, r.error], [false, 'EMPTY'], 'rdns_main_v1 came back with NO customers → refused');
  is(w.calls.filter(c => c.kv === 'put').length, 0, '…nothing written to Cloudflare');
  is([s['rdns_yedek_v1/son'].ok, s['rdns_yedek_v1/son'].hata], [false, 'müşteri listesi boş geldi — yedek alınmadı'],
     '…and the index goes RED, so the card says so instead of showing yesterday as if all were well');
}
{
  const w = makeWorker(freshStore());
  is((await w.api.runBackup({ RD_WA: w.env.RD_WA }, FRI)).error, 'NO_FB_SECRET', 'no FB_SECRET → out before touching anything');
  const w2 = makeWorker(freshStore(), { noKv: true });
  is((await w2.api.runBackup({ FB_SECRET: 'sek' }, FRI)).error, 'NO_KV', 'no KV binding → out, rather than a backup nobody is keeping');
}
{
  const s = freshStore();
  const w = makeWorker(s, { kvThrow: 'KV down' });
  const r = await w.api.runBackup(w.env, FRI);
  is([r.ok, r.error], [false, 'KV_WRITE'], 'Cloudflare refused the write → recorded as a failure');
  is(s['rdns_yedek_v1/son'].ok, false, '…and the card goes red rather than silently showing the old date');
}

console.log('6. ⚠ the tripwire — what nobody saw on 8 Ekim');
{
  // The bar, in the abstract. A tenth would have let 8 Ekim through: 702 → 655
  // is a drop of 6.7%. The book only grows by itself, so the bar is low.
  const w0 = makeWorker({});
  is(w0.api.ydDrop(702, 655), 47, '702 → 655, the real one, is caught');
  is(w0.api.ydDrop(702, 697), 0, 'five merged away out of 702 is housekeeping');
  is(w0.api.ydDrop(702, 694), 8, '…eight is not');
  is(w0.api.ydDrop(40, 36), 4, 'a small book still gets three customers of slack, no more');
  is(w0.api.ydDrop(0, 500), 0, 'the very first night has nothing to compare with');
  is(w0.api.ydDrop(700, 900), 0, 'a day that GAINS customers is never an alarm');
}
{
  const s = freshStore(702);
  const w = makeWorker(s);
  await w.api.runBackup(w.env, FRI);                                  // 702 tonight
  is(s['rdns_yedek_v1/son'].uyari, null, 'a normal night raises nothing');

  s['rdns_main_v1'] = mkMain(655);                                    // the reception laptop strips 47
  const w2 = makeWorker(s, { kv: w.kv });
  const r2 = await w2.api.runBackup(w2.env, new Date(Date.UTC(2026, 9, 10, 3, 0)));
  is(r2.ok, true, 'the next morning the backup is still TAKEN — 655 saved is better than nothing saved');
  is(s['rdns_yedek_v1/son'].uyari, '47 müşteri bir gecede eksildi (702 → 655) — silinme olmuş olabilir',
     '…but the index carries the warning, and the dashboard card turns that red');
  is(s['rdns_yedek_v1/son'].onceki, 702, '…with last night\'s count beside it, so the size of the loss is on the screen');
  is(w2.logs.some(l => /⚠ 47 müşteri bir gecede eksildi/.test(l)), true, '…and wrangler tail shouts it too');

  // a small, ordinary day-to-day wobble must NOT cry wolf
  s['rdns_main_v1'] = mkMain(650);
  const w3 = makeWorker(s, { kv: w.kv });
  await w3.api.runBackup(w3.env, new Date(Date.UTC(2026, 9, 12, 3, 0)));
  is(s['rdns_yedek_v1/son'].uyari, null, 'five customers merged away overnight is housekeeping, not an alarm');
}

console.log('7. reading it back');
{
  const s = freshStore();
  const w = makeWorker(s);
  await w.api.runBackup(w.env, FRI);
  s['rdns_main_v1'] = mkMain(700);
  const w2 = makeWorker(s, { kv: w.kv });
  await w2.api.runBackup(w2.env, new Date(Date.UTC(2026, 9, 10, 3, 0)));

  const list = await w2.api.ydList(w2.env);
  is(list.ok, true, 'the list reads');
  is(list.list.map(x => x.day), ['2026-10-10', '2026-10-09'], '…newest first, which is the one he will want');
  is(list.son.clients, 700, '…and says which is the newest GOOD one');

  const got = await w2.api.ydGet(w2.env, '2026-10-09');
  is([got.ok, got.day], [true, '2026-10-09'], 'one day comes back by date');
  is(JSON.parse(got.json).rdns_main ? JSON.parse(JSON.parse(got.json).rdns_main).clients.length : 0, 702,
     '…and it is still the 702, two nights later — this is the file that would have saved 8 Ekim');
  is((await w2.api.ydGet(w2.env, '2020-01-01')).error, 'NOT_FOUND', 'a day with no snapshot says so');
  is((await w2.api.ydGet(w2.env, 'dün')).error, 'BAD_DAY', '…and nonsense is refused, not looked up');
}

console.log('8. the page, the routes and the cron');
{
  const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
  const toml = fs.readFileSync(path.join(__dirname, '..', 'worker', 'wrangler.toml'), 'utf8');
  is(/if \(h <= 7\) \{/.test(WSRC), true, 'the cron runs it before 08:00, when the salon is shut and yesterday is finished');
  is(/crons = \["0 3 \* \* \*", "0 4 \* \* \*"/.test(toml), true,
     'on the two lines that already fire EVERY day — Sunday included, and no new cron was needed');
  is(/await sendMorningReminders\(env\);[\s\S]{0,400}?await runBackup\(env, when\)/.test(WSRC), true,
     '…and after the morning reminders, so a big read can never hold up a customer\'s text');
  is(/route === '\/wa\/yedek-liste'/.test(WSRC) && /route === '\/wa\/yedek-indir'/.test(WSRC) && /route === '\/wa\/yedek-simdi'/.test(WSRC),
     true, 'the three routes the card uses: list, fetch one, take one now');
  is(/id="yd-state"/.test(html) && /id="yd-list"/.test(html), true, 'Ayarlar has the card');
  is(/if\(page==="settings"\)\{[\s\S]{0,200}?ydRefresh\(\)/.test(html), true, '…and it refreshes when he opens Ayarlar');
  is(/a\.download = 'RoyalDiamond_Yedek_' \+ j\.day \+ '\.json'/.test(html), true,
     'a downloaded day is named like every other backup file, so the restore screen takes it unchanged');
  is(/AUTO_BACKUP_HOUR = 22/.test(html), true,
     'the old 22:00 download is left in place — it has fired once since Temmuz, and a stray extra copy harms nobody');
}

console.log('');
console.log(fail ? `✗ ${fail} FAILED, ${pass} passed` : `✓ all ${pass} passed`);
process.exit(fail ? 1 : 0);
})();
