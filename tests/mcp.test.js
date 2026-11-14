/* mcp.test.js — the read-only connector that lets Claude read the salon's book.

   Two things are being pinned here, and the second matters more than the first.

   1. THAT IT SPEAKS MCP. Claude opens with an `initialize` handshake and will
      not talk to a server that answers it wrongly. So: the handshake, the tool
      list, a tool call, a notification getting 202 and nothing else, and the
      two kinds of error kept apart — an unknown tool is a JSON-RPC error, a
      tool that could not read the book is a RESULT carrying isError.

   2. THAT IT CANNOT WRITE. The whole case for leaving this switched on is that
      the worst it can do is answer wrongly. So one test reads every line of
      the file and fails on any sign of a write — a PUT, a POST to Firebase, a
      PATCH, a DELETE. If somebody later adds a "just one small update" tool,
      this test is what stops it going out quietly.

   Run: node tests/mcp.test.js
*/

const assert = require('assert');
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

const SRC = path.join(__dirname, '..', 'worker', 'src', 'mcp.js');

let pass = 0, fail = 0;
const todo = [];
function test(name, fn){ todo.push([name, fn]); }
async function run(){
  const mod = await import(pathToFileURL(SRC).href);
  for (const [name, fn] of todo){
    try { await fn(mod); pass++; }
    catch (e){ fail++; console.error('  ✗ ' + name + '\n    ' + (e && e.message)); }
  }
  console.log('\n' + pass + ' passed, ' + fail + ' failed');
  process.exit(fail ? 1 : 0);
}

// ── a salon to answer about ───────────────────────────────────────────────
const CLIENTS = [
  { id: 101, name: 'SEVCAN ÜSTÜNER', phone: '905488606075', visits: 4, lastVisit: '2026-11-07' },
  { id: 102, name: 'BERDA SAVCI',    phone: '905338699327', visits: 9, lastVisit: '2026-11-10' },
  { id: 103, name: 'Hamide Kucuk',   phone: '',             visits: 1 }
];
const APPTS = [
  { id: 1, clientId: 101, datetime: '2026-11-14T13:00', staff: 'Helen', service: 'Dolgu',   price: 1700, status: 'confirmed' },
  { id: 2, clientId: 102, datetime: '2026-11-14T13:00', staff: 'Lissa', service: 'Pedikür', price: 1200, status: 'completed' },
  { id: 3, clientId: 103, datetime: '2026-11-14T09:00', staff: 'Helen', service: 'Manikür', price: 900,  status: 'cancelled', noShow: true },
  { id: 4, clientId: 101, datetime: '2026-10-07T16:00', staff: 'Helen', service: 'Dolgu',   price: 1500, status: 'completed' },
  { id: 5, clientId: 102, datetime: '2026-10-09T11:00', staff: 'Lissa', service: 'Manikür', price: 800,  status: 'completed' },
  { id: 6, clientId: 101, datetime: '2026-11-07T12:00', staff: 'Emma',  service: 'Dolgu',   price: 1700, status: 'completed' }
];

// The module fetches Firebase; give it a fetch that answers with our salon.
function installFetch(){
  globalThis.fetch = async () => ({
    ok: true,
    status: 200,
    json: async () => ({ clients: CLIENTS, appointments: APPTS })
  });
}
function breakFetch(){
  globalThis.fetch = async () => ({ ok: false, status: 503, json: async () => ({}) });
}
const ENV = { MCP_KEY: 'test-key-0123456789', FB_SECRET: 'x' };

// Fresh module each time, so the one-minute cache can't leak between tests.
async function fresh(){
  return await import(pathToFileURL(SRC).href + '?t=' + Math.random());
}
function post(body, headers){
  return new Request('https://w.example/mcp', {
    method: 'POST',
    headers: Object.assign({ 'content-type': 'application/json' }, headers || {}),
    body: JSON.stringify(body)
  });
}
const call = async (m, body, headers) =>
  m.handleMcp(post(body, headers || { authorization: 'Bearer test-key-0123456789' }), ENV, null, new URL('https://w.example/mcp'));

// ── the door ──────────────────────────────────────────────────────────────
console.log('\nthe door');

test('no key at all is 401, with no clue why', async () => {
  const m = await fresh();
  const r = await m.handleMcp(post({ jsonrpc: '2.0', id: 1, method: 'tools/list' }), ENV, null, new URL('https://w.example/mcp'));
  assert.strictEqual(r.status, 401);
  assert.strictEqual(await r.text(), '');
});

test('a wrong key is 401', async () => {
  const m = await fresh();
  const r = await call(m, { jsonrpc: '2.0', id: 1, method: 'tools/list' }, { authorization: 'Bearer wrong-key-012345678' });
  assert.strictEqual(r.status, 401);
});

test('x-rd-key is accepted as well as Bearer', async () => {
  installFetch();
  const m = await fresh();
  const r = await call(m, { jsonrpc: '2.0', id: 1, method: 'tools/list' }, { 'x-rd-key': 'test-key-0123456789' });
  assert.strictEqual(r.status, 200);
});

test('the key check is length-safe and constant time', async () => {
  const m = await fresh();
  assert.strictEqual(m.__test.sameKey('abc', 'abc'), true);
  assert.strictEqual(m.__test.sameKey('abc', 'abcd'), false);
  assert.strictEqual(m.__test.sameKey('', ''), false);
  assert.strictEqual(m.__test.sameKey('abc', 'abd'), false);
});

test('GET and DELETE are refused, not silently ignored', async () => {
  const m = await fresh();
  const r = await m.handleMcp(new Request('https://w.example/mcp', { method: 'GET' }), ENV, null, new URL('https://w.example/mcp'));
  assert.strictEqual(r.status, 405);
});

// ── the handshake ─────────────────────────────────────────────────────────
console.log('\nthe handshake');

test('initialize answers with tools and the salon\'s name', async () => {
  const m = await fresh();
  const r = await call(m, { jsonrpc: '2.0', id: 1, method: 'initialize', params: { protocolVersion: '2025-06-18', capabilities: {} } });
  const j = await r.json();
  assert.strictEqual(j.jsonrpc, '2.0');
  assert.strictEqual(j.id, 1);
  assert.strictEqual(j.result.protocolVersion, '2025-06-18');
  assert.ok(j.result.capabilities.tools);
  assert.strictEqual(j.result.serverInfo.name, 'royal-diamond');
  assert.ok(/SADECE OKUR/.test(j.result.instructions), 'the instructions must say it is read-only');
});

test('a newer client gets its own version echoed back', async () => {
  const m = await fresh();
  const r = await call(m, { jsonrpc: '2.0', id: 9, method: 'initialize', params: { protocolVersion: '2026-07-28' } });
  assert.strictEqual((await r.json()).result.protocolVersion, '2026-07-28');
});

test('notifications/initialized gets 202 and an empty body', async () => {
  const m = await fresh();
  const r = await call(m, { jsonrpc: '2.0', method: 'notifications/initialized' });
  assert.strictEqual(r.status, 202);
  assert.strictEqual(await r.text(), '');
});

test('ping answers', async () => {
  const m = await fresh();
  const j = await (await call(m, { jsonrpc: '2.0', id: 2, method: 'ping' })).json();
  assert.deepStrictEqual(j.result, {});
});

test('an unknown method is -32601, not a crash', async () => {
  const m = await fresh();
  const j = await (await call(m, { jsonrpc: '2.0', id: 3, method: 'resources/list' })).json();
  assert.strictEqual(j.error.code, -32601);
});

test('a batch is refused clearly', async () => {
  const m = await fresh();
  const j = await (await call(m, [{ jsonrpc: '2.0', id: 1, method: 'ping' }])).json();
  assert.strictEqual(j.error.code, -32600);
});

// ── the tools ─────────────────────────────────────────────────────────────
console.log('\nthe tools');

test('tools/list names every tool with a schema', async () => {
  const m = await fresh();
  const j = await (await call(m, { jsonrpc: '2.0', id: 4, method: 'tools/list' })).json();
  assert.ok(j.result.tools.length >= 6);
  for (const t of j.result.tools){
    assert.ok(t.name && t.description, 'tool needs a name and a description');
    assert.strictEqual(t.inputSchema.type, 'object');
    assert.ok(Array.isArray(t.inputSchema.required), t.name + ' must say what it requires');
  }
});

test('a day lists its bookings in clock order', async () => {
  installFetch();
  const m = await fresh();
  const j = await (await call(m, { jsonrpc: '2.0', id: 5, method: 'tools/call',
    params: { name: 'gun_randevulari', arguments: { tarih: '2026-11-14' } } })).json();
  const text = j.result.content[0].text;
  assert.strictEqual(j.result.isError, false);
  assert.ok(text.indexOf('09:00') < text.indexOf('13:00'), 'nine o\'clock must come before one');
  assert.ok(/SEVCAN ÜSTÜNER/.test(text));
  assert.ok(/GELMEDİ/.test(text), 'a no-show must be marked');
});

test('a day\'s summary adds up only the completed work', async () => {
  installFetch();
  const m = await fresh();
  const j = await (await call(m, { jsonrpc: '2.0', id: 6, method: 'tools/call',
    params: { name: 'gun_ozeti', arguments: { tarih: '2026-11-14' } } })).json();
  const t = j.result.content[0].text;
  assert.ok(/Randevu: 3/.test(t));
  assert.ok(/Tamamlanan: 1/.test(t));
  assert.ok(/Gelmedi: 1/.test(t));
  assert.ok(/1\.200/.test(t), 'only the completed 1.200 counts, not the booked 1.700');
});

test('searching finds a Turkish name whatever the case', async () => {
  installFetch();
  const m = await fresh();
  const j = await (await call(m, { jsonrpc: '2.0', id: 7, method: 'tools/call',
    params: { name: 'musteri_ara', arguments: { aranan: 'üstüner' } } })).json();
  assert.ok(/SEVCAN ÜSTÜNER/.test(j.result.content[0].text));
});

test('searching by part of a telephone number finds her', async () => {
  installFetch();
  const m = await fresh();
  const j = await (await call(m, { jsonrpc: '2.0', id: 8, method: 'tools/call',
    params: { name: 'musteri_ara', arguments: { aranan: '8606075' } } })).json();
  assert.ok(/SEVCAN/.test(j.result.content[0].text));
});

test('one or two characters is refused rather than returning the whole book', async () => {
  installFetch();
  const m = await fresh();
  const j = await (await call(m, { jsonrpc: '2.0', id: 10, method: 'tools/call',
    params: { name: 'musteri_ara', arguments: { aranan: 'a' } } })).json();
  assert.ok(/en az iki/.test(j.result.content[0].text));
});

test('a customer\'s history is newest first', async () => {
  installFetch();
  const m = await fresh();
  const j = await (await call(m, { jsonrpc: '2.0', id: 11, method: 'tools/call',
    params: { name: 'musteri_gecmisi', arguments: { musteri_id: '101' } } })).json();
  const t = j.result.content[0].text;
  assert.ok(t.indexOf('2026-11-14') < t.indexOf('2026-11-07'), 'newest must come first');
  assert.ok(t.indexOf('2026-11-07') < t.indexOf('2026-10-07'));
});

test('a month totals each technician', async () => {
  installFetch();
  const m = await fresh();
  const j = await (await call(m, { jsonrpc: '2.0', id: 12, method: 'tools/call',
    params: { name: 'personel_ay', arguments: { ay: '2026-10' } } })).json();
  const t = j.result.content[0].text;
  assert.ok(/Helen: 1 iş/.test(t));
  assert.ok(/Lissa: 1 iş/.test(t));
  assert.ok(/2\.300/.test(t), 'the month should total 2.300');
});

test('a bad date is told, not guessed at', async () => {
  installFetch();
  const m = await fresh();
  const j = await (await call(m, { jsonrpc: '2.0', id: 13, method: 'tools/call',
    params: { name: 'gun_randevulari', arguments: { tarih: '14/11/2026' } } })).json();
  assert.ok(/YYYY-AA-GG/.test(j.result.content[0].text));
});

test('an unknown tool is a protocol error', async () => {
  const m = await fresh();
  const j = await (await call(m, { jsonrpc: '2.0', id: 14, method: 'tools/call',
    params: { name: 'randevu_sil', arguments: {} } })).json();
  assert.strictEqual(j.error.code, -32602);
});

test('a book that will not load is isError, not a dead conversation', async () => {
  breakFetch();
  const m = await fresh();
  const j = await (await call(m, { jsonrpc: '2.0', id: 15, method: 'tools/call',
    params: { name: 'gun_ozeti', arguments: { tarih: '2026-11-14' } } })).json();
  assert.strictEqual(j.result.isError, true);
  assert.ok(/okunamadı/.test(j.result.content[0].text));
});

// ── it cannot write ───────────────────────────────────────────────────────
console.log('\nit cannot write');

test('the source contains no write of any kind', () => {
  const src = fs.readFileSync(SRC, 'utf8');
  const code = src.replace(/\/\*[\s\S]*?\*\//g, '').replace(/^\s*\/\/.*$/gm, '');
  for (const bad of [/method\s*:\s*['"]PUT['"]/i, /method\s*:\s*['"]PATCH['"]/i,
                     /method\s*:\s*['"]DELETE['"]/i, /method\s*:\s*['"]POST['"]/i]){
    assert.ok(!bad.test(code), 'a write appeared in mcp.js: ' + bad);
  }
  assert.ok(!/fbWrite|syncPush|piyziCall/.test(code), 'mcp.js must not reach the writing helpers');
});

test('no tool is named anything that sounds like a change', () => {
  const src = fs.readFileSync(SRC, 'utf8');
  for (const m of src.matchAll(/name:\s*'([a-z_]+)'/g)){
    assert.ok(!/(sil|ekle|yaz|gonder|gönder|kaydet|degistir|değiştir|iptal|olustur|oluştur)/.test(m[1]),
      'tool name suggests a write: ' + m[1]);
  }
});

test('a phone number is only given out by the search tool', async () => {
  installFetch();
  const m = await fresh();
  for (const name of ['gun_randevulari', 'gun_ozeti', 'bos_saatler']){
    const j = await (await call(m, { jsonrpc: '2.0', id: 16, method: 'tools/call',
      params: { name, arguments: { tarih: '2026-11-14' } } })).json();
    assert.ok(!/90\d{10}/.test(j.result.content[0].text), name + ' leaked a telephone number');
  }
});

run();
