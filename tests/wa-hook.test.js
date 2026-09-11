// ═══════════════════════════════════════════════════════════════════════════
// The Piyzi webhook — the REAL route out of worker/src/index.js run against
// a recording stub for fetch, and the REAL reception-side helpers sliced out
// of index.html. No network, no Piyzi, no key leaves this process.
//
//   1. the signature: sha256= + HMAC-SHA256 of the RAW body; a tampered
//      body, a wrong key, a missing header all fail — constant-time
//   2. the registration handshake: GET ?challenge= is echoed as plain text
//   3. the door: no secret → 503 and nothing read; bad signature → 401 and
//      nothing read
//   4. message.received is kept in rdns_wa_replies_v1 with her phone, name,
//      words, and the latest gap-filler offer to that phone; the offer is
//      marked replied; a duplicate deliveryId writes nothing; a button tap's
//      label is her text; the name falls back to the offer's
//   5. message.sent is dropped, message.failed is logged, no phone is dropped,
//      no FB_SECRET → 503 so Piyzi retries
//   6. the route sits before the keyed /wa/ routes
//   7. reception: rdCallScan raises an unread reply first, mode 'reply';
//      read, answered and snoozed ones stay down; the card carries her name,
//      number, words and the offer; the dashboard line and panel exist
//
// Run:  node tests/wa-hook.test.js
// ═══════════════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const vm = require('vm');
const nodeCrypto = require('crypto');

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
const html = fs.readFileSync(path.join(__dirname, '..', 'index.html'), 'utf8');
const wsrc = fs.readFileSync(path.join(__dirname, '..', 'worker', 'src', 'index.js'), 'utf8');

function makeWorker(store) {
  const calls = [], logs = [];
  const fetch = async (url, init) => {
    init = init || {};
    const method = init.method || 'GET';
    const body = init.body ? JSON.parse(init.body) : null;
    calls.push({ url: String(url), method, body });
    const m = String(url).match(/firebaseio\.com\/(.+?)\.json/);
    const p = m ? decodeURIComponent(m[1]) : '';
    if (method === 'GET') { const v = Object.prototype.hasOwnProperty.call(store, p) ? store[p] : null; return { ok: true, status: 200, json: async () => v }; }
    return { ok: true, status: 200, json: async () => null, text: async () => '' };
  };
  const cut = wsrc.indexOf('\nexport {');
  const ctx = {
    console: { log: (...a) => logs.push(a.join(' ')), warn: () => {}, error: () => {} },
    TextEncoder, Intl, setTimeout, AbortSignal, fetch, crypto: globalThis.crypto, Response, Headers, URL,
    R_PAGE: '', CROWN: C
  };
  vm.createContext(ctx);
  vm.runInContext(wsrc.slice(0, cut).replace(/^import .*$/gm, '') +
    '\n;__api = { hookSign, hookVerify, hookParse, hookMatchOffer, handleHook };', ctx, { filename: 'worker-slice.js' });
  return { api: ctx.__api, calls, logs, writes: () => calls.filter(c => c.method !== 'GET') };
}
const SECRET = 'whsec_test_key_1234';
const sign = raw => 'sha256=' + nodeCrypto.createHmac('sha256', SECRET).update(raw).digest('hex');
const NOW = Date.UTC(2026, 8, 14, 7, 30);   // Monday 14 Eylül, 10:30 at the salon
const evt = (over) => JSON.stringify(Object.assign({
  apiVersion: 'v1', event: 'message.received', deliveryId: 'evt_9f2c1a7b3d4e5f60718293a4', timestamp: new Date(NOW).toISOString(),
  data: {
    channel: 'whatsapp', origin: null, conversationUid: 'a1b2c3d4e5f6', customerUid: 'f6e5d4c3b2a1',
    contact: { phone: '+905321234567', name: 'Ayşe Yılmaz' },
    message: { uid: '0192a3b4c5d6', type: 'text', text: 'Evet, isterim', template: null, button: null, context: { messageUid: 'sent_uid_1' }, media: null, timestamp: new Date(NOW - 60e3).toISOString() },
    serviceWindow: { open: true, expiresAt: new Date(NOW + 86400e3).toISOString() }
  }
}, over || {}));
const req = (raw, headers, method) => ({ method: method || 'POST', headers: new Headers(headers || {}), text: async () => raw });
const url = (q) => new URL('https://rd-buttons.royaldiamond.workers.dev/wa/hook' + (q || ''));
const env = { PIYZI_WEBHOOK_SECRET: SECRET, FB_SECRET: 'sek', PIYZI_API_KEY: 'key' };
const offers = {
  'o-old':   { d: '2026-09-01', t: '10:00', tech: 'Lissa', cid: '1', name: 'Ayşe Y.', phone: '905321234567', ts: NOW - 20 * 86400e3, day: '2026-08-25', st: 'expired' },
  'o-late':  { d: '2026-09-15', t: '12:00', tech: 'Hannah', cid: '1', name: 'Ayşe Y.', phone: '905321234567', ts: NOW - 2 * 3600e3, day: '2026-09-14', st: 'offered', service: 'Dolgu (Infill)' },
  'o-mid':   { d: '2026-09-14', t: '16:00', tech: 'Helen', cid: '1', name: 'Ayşe Y.', phone: '905321234567', ts: NOW - 26 * 3600e3, day: '2026-09-13', st: 'expired' },
  'o-fail':  { d: '2026-09-15', t: '13:00', tech: 'Hannah', cid: '1', name: 'Ayşe Y.', phone: '905321234567', ts: NOW - 3600e3, day: '2026-09-14', st: 'failed' },
  'o-other': { d: '2026-09-15', t: '14:00', tech: 'Hannah', cid: '2', name: 'Bella', phone: '905339999999', ts: NOW - 3600e3, day: '2026-09-14', st: 'offered' },
};
const store = () => ({ 'rdns_gapfill_v1/offers': offers });

(async () => {
  console.log('1. the signature');
  {
    const { api } = makeWorker({});
    const raw = evt();
    is(await api.hookSign(SECRET, raw), sign(raw), 'sha256= + HMAC-SHA256 of the raw body, hex — the same bytes Node signs');
    is(await api.hookVerify(SECRET, raw, sign(raw)), true, 'a genuine signature verifies');
    is(await api.hookVerify(SECRET, raw + ' ', sign(raw)), false, 'one byte changed in the body → refused');
    is(await api.hookVerify('whsec_other', raw, sign(raw)), false, 'the wrong key → refused');
    is(await api.hookVerify(SECRET, raw, ''), false, 'no header → refused');
    is(await api.hookVerify('', raw, sign(raw)), false, 'no secret → refused');
    is(await api.hookVerify(SECRET, raw, ' ' + sign(raw) + '\n'), true, 'surrounding whitespace on the header is tolerated');
    is(/sameKey\(await hookSign/.test(wsrc), true, 'compared constant-time, through the same sameKey as the buttons\' door');
  }

  console.log('2. the registration handshake');
  {
    const { api, calls } = makeWorker({});
    const r = await api.handleHook(req('', {}, 'GET'), env, null, url('?challenge=3f7a1b2c'));
    is([r.status, await r.text(), r.headers.get('content-type')], [200, '3f7a1b2c', 'text/plain; charset=utf-8'], 'GET ?challenge= → 200, the value, plain text');
    const r2 = await api.handleHook(req('', {}, 'GET'), env, null, url(''));
    is(r2.status, 400, 'GET without a challenge → 400');
    is(calls.length, 0, 'neither touches the database');
    const r3 = await api.handleHook(req('', {}, 'PUT'), env, null, url(''));
    is(r3.status, 405, 'PUT → 405');
  }

  console.log('3. the door');
  {
    const { api, calls } = makeWorker(store());
    const raw = evt();
    const r = await api.handleHook(req(raw, { 'x-piyzi-signature': sign(raw) }), { FB_SECRET: 'sek' }, null, url());
    is([r.status, calls.length], [503, 0], 'no PIYZI_WEBHOOK_SECRET → 503 and nothing read');
    const r2 = await api.handleHook(req(raw, { 'x-piyzi-signature': 'sha256=' + '0'.repeat(64) }), env, null, url());
    is([r2.status, calls.length], [401, 0], 'a wrong signature → 401 and nothing read');
    const r3 = await api.handleHook(req(raw, {}), env, null, url());
    is([r3.status, calls.length], [401, 0], 'no signature → 401 and nothing read');
    const r4 = await api.handleHook(req('{not json', { 'x-piyzi-signature': sign('{not json') }), env, null, url());
    is([r4.status, calls.length], [400, 0], 'signed but not JSON → 400');
  }

  console.log('4. a customer\'s reply is kept');
  {
    const w = makeWorker(store());
    const raw = evt();
    const r = await w.api.handleHook(req(raw, { 'x-piyzi-signature': sign(raw), 'x-piyzi-delivery-id': 'evt_9f2c1a7b3d4e5f60718293a4' }), env, null, url());
    is([r.status, await r.text()], [200, 'ok'], '200 ok');
    const put = w.calls.find(c => c.method === 'PUT' && c.url.includes('rdns_wa_replies_v1/'));
    is(!!put, true, 'written under rdns_wa_replies_v1');
    is(put.url.includes('/rdns_wa_replies_v1/evt_9f2c1a7b3d4e5f60718293a4.json'), true, 'keyed by the deliveryId');
    is(put.body, {
      id: 'evt_9f2c1a7b3d4e5f60718293a4', phone: '905321234567', name: 'Ayşe Yılmaz', text: 'Evet, isterim', type: 'text',
      ts: NOW - 60e3, day: '2026-09-14', read: false,
      offerId: 'o-late', offer: { d: '2026-09-15', t: '12:00', tech: 'Hannah', service: 'Dolgu (Infill)' },
      msgUid: '0192a3b4c5d6', contextUid: 'sent_uid_1', conversationUid: 'a1b2c3d4e5f6'
    }, 'the record: her phone normalised, her name, her words, when, unread, and the LATEST real offer to that phone');
    const patch = w.calls.find(c => c.method === 'PATCH' && c.url.includes('/rdns_gapfill_v1/offers/o-late.json'));
    is(patch && patch.body, { replied: true, repliedAt: NOW - 60e3, replyText: 'Evet, isterim', replyId: 'evt_9f2c1a7b3d4e5f60718293a4' }, 'the offer is marked replied with her words');
    is(w.calls.some(c => c.url.includes('rdns_wa_log_v1')), true, 'and a line goes to the WhatsApp log');
    is(w.calls.filter(c => c.method === 'GET').map(c => c.url.replace(/^.*firebaseio\.com\//, '').replace(/\?.*$/, '')), ['rdns_wa_replies_v1/evt_9f2c1a7b3d4e5f60718293a4.json', 'rdns_gapfill_v1/offers.json'], 'reads: is it already kept, then the offers');
    is(w.calls.every(c => /auth=sek/.test(c.url)), true, 'every call carries the secret');
  }
  {
    const s = store(); s['rdns_wa_replies_v1/evt_9f2c1a7b3d4e5f60718293a4'] = { id: 'evt_9f2c1a7b3d4e5f60718293a4', read: true };
    const w = makeWorker(s);
    const raw = evt();
    const r = await w.api.handleHook(req(raw, { 'x-piyzi-signature': sign(raw) }), env, null, url());
    is([r.status, await r.text(), w.writes().length], [200, 'dup', 0], 'the same delivery again → 200, nothing written — a retry never flips it back to unread');
  }
  {
    const w = makeWorker(store());
    const raw = evt({ deliveryId: 'evt_button', data: { contact: { phone: '0532 123 45 67', name: '' }, message: { uid: 'u2', type: 'button', text: '', button: { text: 'Evet, isterim / Yes please', payload: 'x' }, timestamp: new Date(NOW).toISOString() } } });
    await w.api.handleHook(req(raw, { 'x-piyzi-signature': sign(raw) }), env, null, url());
    const put = w.calls.find(c => c.method === 'PUT' && c.url.includes('rdns_wa_replies_v1/'));
    is([put.body.text, put.body.type, put.body.name, put.body.phone], ['Evet, isterim / Yes please', 'button', 'Ayşe Y.', '905321234567'], 'a button tap: its label is her text, the name falls back to the offer\'s, a local 0532… phone normalises');
  }
  {
    const w = makeWorker({ 'rdns_gapfill_v1/offers': {} });
    const raw = evt({ deliveryId: 'evt_nooffer', data: { contact: { phone: '+905321234567', name: 'Ayşe' }, message: { uid: 'u3', type: 'text', text: 'Merhaba', timestamp: new Date(NOW).toISOString() } } });
    const r = await w.api.handleHook(req(raw, { 'x-piyzi-signature': sign(raw) }), env, null, url());
    const put = w.calls.find(c => c.method === 'PUT' && c.url.includes('rdns_wa_replies_v1/'));
    is([r.status, put.body.offerId, put.body.offer, w.calls.some(c => c.method === 'PATCH')], [200, null, null, false], 'no offer to her → kept with no offer, nothing patched');
  }
  {
    const { api } = makeWorker({});
    is(api.hookMatchOffer(offers, '905321234567', NOW), ['o-late', offers['o-late']], 'hookMatchOffer: the latest real offer — not the failed one, not the 20-day-old one');
    is(api.hookMatchOffer(offers, '905321234567', NOW + 15 * 86400e3), null, 'a reply 15 days later matches nothing');
    is(api.hookMatchOffer(offers, '905330000000', NOW), null, 'an unknown phone matches nothing');
    is(api.hookParse(null), null, 'hookParse(null) → null');
    is(api.hookParse({ deliveryId: 'a.b/c#d', event: 'x', data: {} }).deliveryId, 'a_b_c_d', 'the deliveryId is made safe as a Firebase key');
  }

  console.log('5. what is dropped, what is logged, what is retried');
  {
    const w = makeWorker(store());
    const raw = evt({ event: 'message.sent', deliveryId: 'evt_sent', data: { origin: 'scheduled', scheduledMessageUid: 'S1', contact: { phone: '+905321234567' }, message: { uid: null } } });
    const r = await w.api.handleHook(req(raw, { 'x-piyzi-signature': sign(raw) }), env, null, url());
    is([r.status, await r.text(), w.calls.length], [200, 'ignored', 0], 'message.sent → 200 ignored, nothing read or written');
  }
  {
    const w = makeWorker(store());
    const raw = evt({ event: 'message.failed', deliveryId: 'evt_failed', data: { scheduledMessageUid: 'S9', error: { code: 'SERVICE_WINDOW_CLOSED' } } });
    const r = await w.api.handleHook(req(raw, { 'x-piyzi-signature': sign(raw) }), env, null, url());
    const log = w.calls.find(c => c.url.includes('rdns_wa_log_v1'));
    is([r.status, !!log, log && log.body.op, log && log.body.uid, log && log.body.outcome], [200, true, 'hook-failed', 'S9', 'failed:SERVICE_WINDOW_CLOSED'], 'message.failed → 200 and a line in the WhatsApp log');
    is(w.calls.some(c => c.url.includes('rdns_wa_replies_v1')), false, '…and no reply record');
  }
  {
    const w = makeWorker(store());
    const raw = evt({ deliveryId: 'evt_nophone', data: { contact: { phone: '12345', name: 'X' }, message: { uid: 'u', type: 'text', text: 'hi' } } });
    const r = await w.api.handleHook(req(raw, { 'x-piyzi-signature': sign(raw) }), env, null, url());
    is([r.status, await r.text(), w.calls.length], [200, 'no phone', 0], 'a message with no usable phone → acknowledged, not kept');
  }
  {
    const w = makeWorker(store());
    const raw = evt();
    const r = await w.api.handleHook(req(raw, { 'x-piyzi-signature': sign(raw) }), { PIYZI_WEBHOOK_SECRET: SECRET }, null, url());
    is([r.status, w.calls.length], [503, 0], 'no FB_SECRET → 503 so Piyzi retries, nothing read');
  }

  console.log('6. the route');
  {
    const i = wsrc.indexOf("if (url.pathname === '/wa/hook') return handleHook(req, env, ctx, url);");
    const j = wsrc.indexOf("if (url.pathname.startsWith('/wa/')) return handleWa(req, env, ctx, url);");
    is(i > 0 && j > i, true, '/wa/hook is routed BEFORE the keyed /wa/ routes — Piyzi holds no key');
  }

  console.log('7. reception');
  {
    const slice = (a, b) => { const i0 = html.indexOf(a), i1 = html.indexOf(b); if (i0 < 0 || i1 <= i0) throw new Error('markers ' + a); return html.slice(i0, i1); };
    const wa = slice('// WA-SLICE-START', '// WA-SLICE-END');
    const ca = slice('// CALLALERT-SLICE-START', '// CALLALERT-SLICE-END');
    const wr = slice('// WAREPLY-SLICE-START', '// WAREPLY-SLICE-END');
    const np = html.match(/function normalizeWaPhone\(phone\)\{[\s\S]*?\n\}/)[0];
    const store = {};
    const ctx = {
      localStorage: { getItem: k => (k in store ? store[k] : null), setItem: (k, v) => { store[k] = String(v); }, removeItem: k => { delete store[k]; } },
      console: { log: () => {}, warn: () => {}, error: () => {} }, document: { getElementById: () => null },
      window: { CROWN: C }, CROWN: C, setTimeout, Intl,
      clients: [{ id: 1, name: 'Ayşe Yılmaz', phone: '0532 123 45 67' }, { id: 2, name: 'Bella', phone: '905339999999' }],
      appointments: [], apptById: () => null, apptTouch: () => {}, saveAll: () => {}, fetch: () => Promise.reject(new Error('no network')),
    };
    vm.createContext(ctx);
    vm.runInContext(np + '\n' + wa + '\n' + ca + '\n' + wr, ctx, { filename: 'index-slices.js' });
    const now = NOW;
    const day = '2026-09-14';
    const replies = [
      { id: 'r1', phone: '905321234567', name: 'Ayşe Yılmaz', text: 'Evet, isterim', ts: now - 60e3, day, read: false, offerId: 'o-late', offer: { d: '2026-09-15', t: '12:00', tech: 'Hannah', service: 'Dolgu (Infill)' } },
      { id: 'r2', phone: '905339999999', name: '', text: 'Merhaba', ts: now - 30e3, day, read: false, offerId: null, offer: null },
      { id: 'r3', phone: '905331111111', name: 'Okunmuş', text: 'x', ts: now - 10e3, day, read: true },
    ];
    // An ordinary 'change' answer too, so the order between the two is seen.
    const appts = [{ id: 501, clientId: 2, staff: 'Helen', datetime: '2026-09-16T10:00', duration: 60, service: 'Klasik Manikür', status: 'confirmed', waAns: { v: 'change', at: now } }];
    const due = vm.runInContext('rdCallScan', ctx)(appts, ctx.clients, {}, now, replies);
    is(due.map(d => d.mode), ['reply', 'reply', 'change'], 'unread replies are due at once and come BEFORE the change request; the read one is not raised');
    is(due.map(d => d.key).slice(0, 2), ['wr|2026-09-14|r2', 'wr|2026-09-14|r1'], 'newest reply first, keyed wr|day|id');
    const st = { 'wr|2026-09-14|r1': { s: 'ok', at: now }, 'wr|2026-09-14|r2': { s: 'zzz', until: now + 300e3, at: now } };
    is(vm.runInContext('rdCallScan', ctx)([], ctx.clients, st, now, replies).map(d => d.mode), [], 'answered at the desk, or snoozed → stays down');
    is(vm.runInContext('rdCallScan', ctx)([], ctx.clients, st, now + 301e3, replies).map(d => d.key), ['wr|2026-09-14|r2'], 'an expired snooze re-fires');
    is(vm.runInContext('rdCallScan', ctx)(appts, ctx.clients, {}, now).map(d => d.mode), ['change'], 'called the old way, without replies, nothing changes');
    const nameFor = vm.runInContext('rdWrNameFor', ctx);
    is(nameFor(replies[0], ctx.clients), 'Ayşe Yılmaz', 'the name Piyzi sent');
    is(nameFor(replies[1], ctx.clients), 'Bella', 'no name from Piyzi → the customer record with that number');
    is(nameFor({ phone: '905330000000' }, ctx.clients), '+905330000000', 'nobody known → the number, never blank');
    const card = vm.runInContext('rdWrCardHtml', ctx)(replies[0], ctx.clients, 0, 2);
    for (const bit of ['WHATSAPP YANITI — ARAYIN', 'Ayşe Yılmaz', 'tel:+905321234567', '“Evet, isterim”', '15 Eyl', '12:00 · Hannah · Dolgu (Infill)', 'rdCallAns(\'ok\')', 'rdWrGoOffer(\'o-late\')', 'rdCallSnooze()', '1 / 2']) {
      is(card.includes(bit), true, 'the card carries: ' + bit);
    }
    const card2 = vm.runInContext('rdWrCardHtml', ctx)(replies[1], ctx.clients, 0, 1);
    is(card2.includes('rdWrGoOffer'), false, 'no offer → no "Teklife git" button');
    const unread = vm.runInContext('rdWrUnreadOf', ctx)({ a: replies[0], b: replies[2], c: replies[1] });
    is(unread.map(r => r.id), ['r2', 'r1'], 'rdWrUnreadOf: the unread ones, newest first');
    is(/txt:'WhatsApp yanıtı okunmadı — müşteriyi arayın', amber:true, act:"rdDashReveal\('dash-wa-replies-panel'\)"/.test(html), true, 'the dashboard carries the amber count line');
    is(/id="dash-wa-replies-panel"/.test(html) && /id="dash-wa-replies-count"/.test(html), true, 'and the panel with its count');
    is(/id="gf-offer-'\+esc\(o\._id\)\+'"/.test(html), true, 'the gap-filler rows carry an id for "Teklife git"');
    is(/rdCallScan\(appointments, clients, rdCallStore\(\), Date\.now\(\), \(typeof rdWrUnread==='function'\)\?rdWrUnread\(\):\[\]\)/.test(html), true, 'the tick hands the replies to the scan');
  }

  console.log('');
  console.log(fail ? `✗ ${fail} FAILED, ${pass} passed` : `✓ all ${pass} passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('✗ test crashed:', e); process.exit(1); });
