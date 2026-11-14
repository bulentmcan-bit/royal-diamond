/* ═══════════════════════════════════════════════════════════════════════════
   mcp.js — THE SALON'S BOOK, READ-ONLY, FOR CLAUDE.

   What this is. Claude.ai can be given a "custom connector": one https address
   it talks to whenever it needs something. This file is that address for Royal
   Diamond. Ask Claude "who is in at two o'clock on Thursday" or "what did Helen
   take in October" and it comes here and reads the salon's own book, instead of
   somebody driving a browser and reading numbers off a screen.

   READ ONLY, ON PURPOSE. Not one function here writes anything, anywhere. No
   booking can be made, moved or cancelled through it, no message can be sent,
   no price can be changed. The worst a mistake can do is answer a question
   wrongly. The owner chose this on 13 Kasım 2026 and it is the whole reason
   this file is safe to leave switched on.

   THE DOOR. Every request must carry the MCP_KEY, as `Authorization: Bearer …`
   or as `x-rd-key`. Without it: 401, no route names, no reasons, nothing. The
   key is a Cloudflare secret and lives nowhere else — never in this repo, never
   in a message. Behind this door is every customer's name and telephone number,
   so it is treated exactly like the WhatsApp key.

   WHERE THE ANSWERS COME FROM. Firebase, the same `rdns_main_v1` the laptops
   read and write. Never reception's machine — her laptop can be shut and this
   still answers. It is the live book, not the nightly backup, so what Claude
   says and what reception sees are the same thing.

   WHICH MCP. Claude opens with the 2025-era `initialize` handshake, so that is
   what is implemented, and the version the client offers is echoed back rather
   than argued with. Newer clients send extra `_meta` on every call and extra
   headers; those are simply ignored here, which is what lets one server answer
   both. No sessions are minted: there is no state to keep between questions.
   ═══════════════════════════════════════════════════════════════════════════ */

const DB_DEFAULT = 'https://royal-diamond-1031c-default-rtdb.firebaseio.com';
const MAIN_NODE  = 'rdns_main_v1';
const PROTO      = '2025-06-18';

/* The book, fetched once per request and remembered for a minute. A question
   usually needs it more than once ("find her, now list her visits"), and the
   salon's book does not change between two sentences. */
let _cache = null, _cacheAt = 0;
const CACHE_MS = 60000;

async function book(env){
  const now = Date.now();
  if (_cache && (now - _cacheAt) < CACHE_MS) return _cache;
  const base = env.FB_URL || DB_DEFAULT;
  const auth = env.FB_SECRET ? '?auth=' + encodeURIComponent(env.FB_SECRET) : '';
  const r = await fetch(`${base}/${MAIN_NODE}.json${auth}`, { cf: { cacheTtl: 0 } });
  if (!r.ok) throw new Error('Firebase ' + r.status);
  const j = await r.json();
  _cache = {
    clients:      Array.isArray(j && j.clients)      ? j.clients      : [],
    appointments: Array.isArray(j && j.appointments) ? j.appointments : []
  };
  _cacheAt = now;
  return _cache;
}

/* ── small helpers ───────────────────────────────────────────────────────── */

const day   = a => String((a && a.datetime) || '').slice(0, 10);
const hhmm  = a => String((a && a.datetime) || '').slice(11, 16);
const digits= s => String(s || '').replace(/\D/g, '');
const money = n => (Number(n) || 0).toLocaleString('tr-TR') + ' ₺';

// Turkish lower-case, so ÜSTÜNER and üstüner are the same name to search.
const fold = s => String(s || '').toLocaleLowerCase('tr').trim();

function clientOf(b, id){
  return b.clients.find(c => c && String(c.id) === String(id)) || null;
}

// Same-time comparison the diary uses: by clock, then by id so it never flaps.
function byTime(x, y){
  const c = String(x.datetime || '').localeCompare(String(y.datetime || ''));
  return c || (String(x.id) < String(y.id) ? -1 : 1);
}

function onDay(b, d){
  return b.appointments.filter(a => a && day(a) === d).sort(byTime);
}

/* A booking as a line of plain text. The customer's NAME is here because the
   question is always about a person; her TELEPHONE NUMBER is not, because no
   answer about a Tuesday afternoon needs it. The one tool that does hand out a
   number is musteri_ara, where finding her is the point. */
function line(b, a){
  const c = clientOf(b, a.clientId);
  const bits = [
    hhmm(a),
    (c && c.name) || 'bilinmeyen müşteri',
    a.staff || '—',
    a.service || '—'
  ];
  if (Number(a.price) > 0) bits.push(money(a.price));
  const st = a.status === 'completed' ? '✓'
           : a.status === 'cancelled' ? (a.noShow ? 'GELMEDİ' : 'iptal')
           : '';
  if (st) bits.push(st);
  return bits.join(' · ');
}

/* ── the tools ───────────────────────────────────────────────────────────── */

const TOOLS = [
  {
    name: 'gun_randevulari',
    title: 'Bir günün randevuları',
    description: 'Royal Diamond\'da belirli bir günün bütün randevuları: saat, müşteri adı, personel, hizmet, fiyat ve durum. Tarih YYYY-AA-GG. The salon\'s appointments for one date.',
    inputSchema: {
      type: 'object',
      properties: { tarih: { type: 'string', description: 'YYYY-AA-GG, örn 2026-11-14' } },
      required: ['tarih']
    }
  },
  {
    name: 'gun_ozeti',
    title: 'Günün özeti',
    description: 'Bir günün özeti: kaç randevu, kaçı tamamlandı, kaçı iptal/gelmedi, toplam ciro ve personel başına dağılım. A day at a glance.',
    inputSchema: {
      type: 'object',
      properties: { tarih: { type: 'string', description: 'YYYY-AA-GG' } },
      required: ['tarih']
    }
  },
  {
    name: 'musteri_ara',
    title: 'Müşteri ara',
    description: 'İsim parçası veya telefon numarasının bir bölümüyle müşteri arar. Telefon numarasını da döndürür. Finds a customer by part of her name or number.',
    inputSchema: {
      type: 'object',
      properties: { aranan: { type: 'string', description: 'İsim parçası veya numara parçası' } },
      required: ['aranan']
    }
  },
  {
    name: 'musteri_gecmisi',
    title: 'Müşterinin geçmişi',
    description: 'Bir müşterinin bütün ziyaretleri, en yenisi önce: tarih, hizmet, personel, fiyat, durum. Önce musteri_ara ile numarasını bulun. One customer\'s visit history.',
    inputSchema: {
      type: 'object',
      properties: {
        musteri_id: { type: 'string', description: 'musteri_ara\'nın verdiği kimlik' },
        adet: { type: 'number', description: 'Kaç ziyaret gösterilsin (varsayılan 20)' }
      },
      required: ['musteri_id']
    }
  },
  {
    name: 'personel_ay',
    title: 'Personelin ayı',
    description: 'Bir ayda her personelin tamamladığı iş sayısı ve getirdiği ciro. Ay YYYY-AA. What each technician did in a month.',
    inputSchema: {
      type: 'object',
      properties: {
        ay:       { type: 'string', description: 'YYYY-AA, örn 2026-10' },
        personel: { type: 'string', description: 'Tek bir personel için adı (isteğe bağlı)' }
      },
      required: ['ay']
    }
  },
  {
    name: 'bos_saatler',
    title: 'Boş saatler',
    description: 'Belirli bir günde her personelin hangi saatlerinin dolu olduğunu listeler, böylece boş olanlar görülür. Which hours are taken on a day.',
    inputSchema: {
      type: 'object',
      properties: { tarih: { type: 'string', description: 'YYYY-AA-GG' } },
      required: ['tarih']
    }
  }
];

const DATE_RE  = /^\d{4}-\d{2}-\d{2}$/;
const MONTH_RE = /^\d{4}-\d{2}$/;

async function runTool(name, args, env){
  const b = await book(env);
  args = args || {};

  if (name === 'gun_randevulari'){
    const d = String(args.tarih || '');
    if (!DATE_RE.test(d)) return 'Tarih YYYY-AA-GG olmalı, örn 2026-11-14.';
    const list = onDay(b, d);
    if (!list.length) return d + ' için kayıtlı randevu yok.';
    return d + ' — ' + list.length + ' randevu\n' + list.map(a => line(b, a)).join('\n');
  }

  if (name === 'gun_ozeti'){
    const d = String(args.tarih || '');
    if (!DATE_RE.test(d)) return 'Tarih YYYY-AA-GG olmalı.';
    const list = onDay(b, d);
    if (!list.length) return d + ' için kayıtlı randevu yok.';
    let done = 0, cancelled = 0, noShow = 0, income = 0;
    const per = {};
    for (const a of list){
      if (a.status === 'completed'){ done++; income += Number(a.price) || 0; }
      if (a.status === 'cancelled'){ a.noShow ? noShow++ : cancelled++; }
      const k = a.staff || '—';
      per[k] = per[k] || { n: 0, done: 0, income: 0 };
      per[k].n++;
      if (a.status === 'completed'){ per[k].done++; per[k].income += Number(a.price) || 0; }
    }
    const rows = Object.keys(per).sort().map(k =>
      '  ' + k + ': ' + per[k].n + ' randevu, ' + per[k].done + ' tamamlandı, ' + money(per[k].income));
    return [
      d,
      'Randevu: ' + list.length,
      'Tamamlanan: ' + done,
      'İptal: ' + cancelled + (noShow ? ('  ·  Gelmedi: ' + noShow) : ''),
      'Ciro: ' + money(income),
      'Personel:', ...rows
    ].join('\n');
  }

  if (name === 'musteri_ara'){
    const q = String(args.aranan || '').trim();
    if (q.length < 2) return 'Aramak için en az iki harf veya rakam yazın.';
    const qf = fold(q), qd = digits(q);
    const hits = b.clients.filter(c => {
      if (!c) return false;
      if (fold(c.name).indexOf(qf) !== -1) return true;
      return qd.length >= 3 && digits(c.phone).indexOf(qd) !== -1;
    }).slice(0, 25);
    if (!hits.length) return '"' + q + '" ile eşleşen müşteri yok.';
    return hits.map(c =>
      [c.name, c.phone || 'numara yok', 'kimlik ' + c.id,
       (c.visits != null ? c.visits + ' ziyaret' : ''),
       (c.lastVisit ? 'son ' + c.lastVisit : '')].filter(Boolean).join(' · ')
    ).join('\n');
  }

  if (name === 'musteri_gecmisi'){
    const id = String(args.musteri_id || '');
    const c = clientOf(b, id);
    if (!c) return 'Bu kimlikte müşteri yok: ' + id + '. Önce musteri_ara kullanın.';
    const n = Math.max(1, Math.min(200, Number(args.adet) || 20));
    const mine = b.appointments
      .filter(a => a && String(a.clientId) === id)
      .sort((x, y) => byTime(y, x))
      .slice(0, n);
    if (!mine.length) return c.name + ' için kayıtlı ziyaret yok.';
    return c.name + ' — ' + mine.length + ' kayıt (en yenisi önce)\n' +
      mine.map(a => day(a) + ' ' + line(b, a)).join('\n');
  }

  if (name === 'personel_ay'){
    const m = String(args.ay || '');
    if (!MONTH_RE.test(m)) return 'Ay YYYY-AA olmalı, örn 2026-10.';
    const who = args.personel ? fold(args.personel) : null;
    const per = {};
    for (const a of b.appointments){
      if (!a || day(a).slice(0, 7) !== m) continue;
      if (a.status !== 'completed') continue;
      const k = a.staff || '—';
      if (who && fold(k) !== who) continue;
      per[k] = per[k] || { n: 0, income: 0 };
      per[k].n++;
      per[k].income += Number(a.price) || 0;
    }
    const keys = Object.keys(per).sort((x, y) => per[y].income - per[x].income);
    if (!keys.length) return m + ' için tamamlanmış iş yok' + (who ? (' (' + args.personel + ')') : '') + '.';
    const total = keys.reduce((s, k) => s + per[k].income, 0);
    return m + ' — tamamlanan işler\n' +
      keys.map(k => '  ' + k + ': ' + per[k].n + ' iş, ' + money(per[k].income)).join('\n') +
      '\nToplam: ' + money(total) +
      '\n\n(Komisyon ve kesintiler bu sayıdan değil, sistemin maaş ekranlarından okunur.)';
  }

  if (name === 'bos_saatler'){
    const d = String(args.tarih || '');
    if (!DATE_RE.test(d)) return 'Tarih YYYY-AA-GG olmalı.';
    const list = onDay(b, d).filter(a => a.status !== 'cancelled');
    if (!list.length) return d + ' — hiçbir saat dolu değil.';
    const per = {};
    for (const a of list){
      const k = a.staff || '—';
      (per[k] = per[k] || []).push(hhmm(a));
    }
    return d + ' — dolu saatler\n' +
      Object.keys(per).sort().map(k => '  ' + k + ': ' + per[k].join(', ')).join('\n');
  }

  return null;   // unknown tool — the caller turns this into a JSON-RPC error
}

/* ── the door ────────────────────────────────────────────────────────────── */

// Constant time, so a wrong key cannot be found one character at a time.
function sameKey(a, b){
  a = String(a || ''); b = String(b || '');
  if (!a || !b || a.length !== b.length) return false;
  let d = 0;
  for (let i = 0; i < a.length; i++) d |= a.charCodeAt(i) ^ b.charCodeAt(i);
  return d === 0;
}

/* A HEADER, NEVER THE ADDRESS. The /wa/ routes accept their key as ?k= too,
   and that habit nearly came along for the ride. A key in a URL is written
   into Cloudflare's logs, the browser's history and any proxy in between —
   and behind this one is every customer's name and telephone number. So the
   query string is not read here at all, and `url` is taken only to keep the
   signature the router uses. */
function presentedKey(req, _url){
  const h = req.headers.get('authorization') || '';
  const m = /^Bearer\s+(.+)$/i.exec(h.trim());
  if (m) return m[1].trim();
  return req.headers.get('x-rd-key') || '';
}

const CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'POST, OPTIONS',
  'access-control-allow-headers': 'content-type, accept, authorization, x-rd-key, mcp-protocol-version, mcp-session-id, mcp-method, mcp-name',
  'access-control-max-age': '86400'
};

const json = (body, status) => new Response(JSON.stringify(body), {
  status: status || 200,
  headers: { 'content-type': 'application/json', ...CORS }
});

const rpcOk  = (id, result)        => json({ jsonrpc: '2.0', id, result });
const rpcErr = (id, code, message) => json({ jsonrpc: '2.0', id, error: { code, message } });

/* The whole endpoint. Mounted at POST /mcp by index.js. */
export async function handleMcp(req, env, ctx, url){
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: CORS });

  // No sessions and no server-pushed stream, so there is nothing for GET or
  // DELETE to do. Saying so plainly is better than a silent 404.
  if (req.method !== 'POST')
    return new Response('MCP: POST only', { status: 405, headers: CORS });

  if (!(env.MCP_KEY && sameKey(presentedKey(req, url), env.MCP_KEY)))
    return new Response(null, { status: 401, headers: CORS });

  let msg;
  try { msg = await req.json(); }
  catch { return rpcErr(null, -32700, 'Parse error'); }

  // A batch is legal JSON-RPC; Claude does not send one, and answering one
  // properly means interleaving notifications with results. Refused clearly.
  if (Array.isArray(msg)) return rpcErr(null, -32600, 'Batched requests are not supported');

  const id = (msg && msg.id !== undefined) ? msg.id : null;
  const method = String((msg && msg.method) || '');

  // A notification carries no id and expects no body — 202 and nothing else.
  if (msg && msg.id === undefined) return new Response(null, { status: 202, headers: CORS });

  if (method === 'initialize'){
    const asked = msg.params && typeof msg.params.protocolVersion === 'string'
      ? msg.params.protocolVersion : PROTO;
    return rpcOk(id, {
      protocolVersion: asked,     // echo rather than argue; both eras work
      capabilities: { tools: {} },
      serverInfo: { name: 'royal-diamond', title: 'Royal Diamond Nail & Beauty', version: '1.0.0' },
      instructions:
        'Royal Diamond Nail & Beauty, Gönyeli, Lefkoşa. Salonun randevu defterini ' +
        'SADECE OKUR. Hiçbir şey yazılamaz, değiştirilemez, silinemez ve mesaj ' +
        'gönderilemez. Tarihler YYYY-AA-GG, aylar YYYY-AA. Önce musteri_ara ile ' +
        'müşterinin kimliğini bulun, sonra musteri_gecmisi ile geçmişine bakın. ' +
        'Para rakamları randevulara yazılan fiyatlardır; komisyon ve kesintiler ' +
        'sistemin maaş ekranlarından okunur, buradan değil.'
    });
  }

  if (method === 'ping') return rpcOk(id, {});

  if (method === 'tools/list') return rpcOk(id, { tools: TOOLS });

  if (method === 'tools/call'){
    const p = msg.params || {};
    const name = String(p.name || '');
    if (!TOOLS.some(t => t.name === name))
      return rpcErr(id, -32602, 'Unknown tool: ' + name);
    let text;
    try { text = await runTool(name, p.arguments, env); }
    catch (e){
      // A tool that could not answer reports back IN the result, so Claude can
      // say so and carry on, rather than the whole conversation erroring out.
      return rpcOk(id, { content: [{ type: 'text', text: 'Defter okunamadı: ' + String(e && e.message || e) }], isError: true });
    }
    if (text === null) return rpcErr(id, -32602, 'Unknown tool: ' + name);
    return rpcOk(id, { content: [{ type: 'text', text: String(text) }], isError: false });
  }

  return rpcErr(id, -32601, 'Method not found: ' + method);
}

// For the tests, which run this file under node without a network.
export const __test = { TOOLS, runTool, line, fold, digits, sameKey, presentedKey, book };
