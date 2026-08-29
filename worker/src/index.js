/* ============================================================================
   Royal Diamond — the wall buttons' relay
   ----------------------------------------------------------------------------
   One Shelly Button1 on the wall by each technician's station. A press starts
   or finishes her job on the Crown Board, with no phone and no screen.

       single press   start a manicure
       double press   start a pedicure
       triple press   start the eyelashes
       hold ~2s       finish the job she is on

   (Remapped 25 Aug — no dead gesture any more. Until then single did nothing,
   double was the manicure and triple the pedicure; every button URL configured
   before that date shifts one place and must be re-entered when the buttons
   arrive.) The mapping itself lives on the boards (CrownBoard.onButton in
   timers.html) — this relay only checks the gesture is one it knows and
   passes it through. An unknown gesture is ignored quietly: logged here,
   answered politely, never written to the database.

   WHY THIS FILE EXISTS. The Button1 is a first-generation Shelly: the only
   thing it can do when pressed is fetch one fixed web address. It cannot POST,
   cannot send a header, and cannot run anything in a page. So it cannot write
   to Firebase itself (there is no way to write with a plain GET) and it cannot
   call the board, which lives inside a browser tab. This sits in the middle and
   does the one translation:

       [Button1] --GET--> [this worker] --write--> [Firebase timers/press]
                                                          |
                                                    the boards are watching
                                                          v
                                                   CrownBoard.onButton()

   Everything after the write is code that already existed.

   THE ADDRESS EACH BUTTON CALLS:
       https://rd-buttons.royaldiamond.workers.dev/p?who=lissa&g=double&k=<key>

   Only `who=` differs between buttons. Six technicians, six buttons, one
   address. Adding a technician is: her line in crown-config.js, her key in
   PEOPLE below, and her four URLs typed into her button. No change to the
   board.

   THE TWO SECRETS are wrangler secrets and are never in this repo — this folder
   is published as a public website. See README.md.
   ========================================================================== */

// Must match the operator keys in crown-config.js. A name that is on the button
// but not in here is refused at the door, so a button pointed at somebody who
// has left cannot quietly file jobs for her.
const PEOPLE = ['helen', 'hannah', 'lissa'];

const GESTURES = ['single', 'double', 'triple', 'long'];

const DB = 'https://royal-diamond-1031c-default-rtdb.firebaseio.com';

// The shared key sits in a URL, so it is only ever a lock on the door, not a
// serious secret — but the comparison should still not tell an attacker how
// much of a guess was right, hence no plain !== on it.
function sameKey(a, b) {
  const enc = new TextEncoder();
  const x = enc.encode(String(a || ''));
  const y = enc.encode(String(b || ''));
  let diff = x.length ^ y.length;
  for (let i = 0; i < Math.max(x.length, y.length); i++) diff |= (x[i] || 0) ^ (y[i] || 0);
  return diff === 0;
}

const reply = (body, status) =>
  new Response(body, { status, headers: { 'cache-control': 'no-store' } });

/* ── the 06:00 appointment reminders, by SMS ────────────────────────────────
   The cron fires at 03:00 AND 04:00 UTC (see wrangler.toml), because 06:00 in
   the salon is a different UTC hour summer and winter. The decision of which
   firing is real belongs to the timezone database, never to a fixed offset —
   a hard-coded "+3" is exactly the bug that would move the reminders to five
   in the morning the week the clocks go back.

   WhatsApp's Cloud API is closed to us — Meta cannot verify a North Cyprus
   business (their error 2494160), 360dialog is partner-referral only and
   Twilio wants a Turkish entity — so the reminders go as plain SMS from an
   Android phone in the salon with the salon's own SIM (+90 539 140 3333).

   The phone has no public address, so this worker never calls the phone: the
   SMS Gateway for Android app on it keeps its OWN connection out to
   api.sms-gate.app, and this worker posts the message there. The relay hands
   it to the phone over that standing connection, and the phone sends it as an
   ordinary text. Replies go to the salon's main number, which is printed in
   the message — never to the sending SIM.

   Nothing here runs until the flag in wrangler.toml says so. */
const SMSGATE_URL = 'https://api.sms-gate.app/3rdparty/v1/messages';
const SMS_DAILY_CAP = 40;   // the salon's busiest day is ~30 customers; a run
                            // that wants more than this is a bug, not a rush
const SMS_REPLY_NUMBER = '0548 893 3333';

function nicosiaHour(now) {
  return Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Nicosia', hour: 'numeric', hour12: false
  }).format(now));
}
// The salon's calendar date, which around six in the morning is not reliably
// the UTC date.
function nicosiaYmd(now) {
  return new Intl.DateTimeFormat('en-CA', {
    timeZone: 'Asia/Nicosia', year: 'numeric', month: '2-digit', day: '2-digit'
  }).format(now);
}

// The same cleanup reception's screen applies to a phone number (its
// normalizeWaPhone), minus the corrupted-record heuristics: digits only,
// local 0xxx and bare forms lifted to country code 90. Returns E.164 with a
// leading +, or null for anything that does not come out a plausible Turkish
// mobile — a reminder must never be fired at a mangled number.
function smsPhone(raw) {
  let p = String(raw || '').replace(/[^0-9+]/g, '').replace(/^\+/, '');
  p = p.replace(/^0090/, '90').replace(/^090/, '90').replace(/^00/, '');
  if (p.startsWith('0')) p = '90' + p.slice(1);
  else if (!p.startsWith('90') && p.length <= 10) p = '90' + p;
  return /^90\d{10}$/.test(p) ? '+' + p : null;
}

// The settled wording (18 Aug). Only the time changes — no name, so one
// recording of the sentence fits every customer. Proper Turkish with accents;
// three SMS parts, and that is accepted.
function smsText(time) {
  return 'Merhabalar, bugün saat ' + time +
    "'de Royal Diamond'da randevunuz var. " +
    'Yoğun programımız nedeniyle lütfen zamanında gelin. ' +
    '15 dk gecikmede randevu ertelenebilir. ' +
    'Değişiklik için bizi arayın: ' + SMS_REPLY_NUMBER;
}

// Today's sendable reminders out of the salon's data: every appointment on
// the given date that is not cancelled, joined to its client for the name and
// number. Pure, so it can be tested against fixtures without a phone in hand.
function pickReminders(data, ymd, alreadySent) {
  const appts = (data && Array.isArray(data.appointments)) ? data.appointments : [];
  const clients = (data && Array.isArray(data.clients)) ? data.clients : [];
  const byId = {};
  clients.forEach(c => { if (c && c.id != null) byId[String(c.id)] = c; });
  const out = [], skipped = [];
  appts.forEach(a => {
    if (!a || a.id == null) return;
    const dt = String(a.datetime || '');
    if (!/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}/.test(dt) || dt.slice(0, 10) !== ymd) return;
    if (a.status === 'cancelled') return;                       // guard: no texts for cancelled bookings
    if (alreadySent && alreadySent[String(a.id)]) return;       // guard: one reminder per appointment, ever
    const cl = byId[String(a.clientId)];
    const phone = smsPhone(cl && cl.phone);
    if (!cl || !phone) { skipped.push({ id: a.id, why: cl ? 'bad-phone' : 'no-client' }); return; }
    out.push({ apptId: a.id, phone, text: smsText(dt.slice(11, 16)) });
  });
  out.sort((x, y) => String(x.apptId).localeCompare(String(y.apptId)));
  return { send: out, skipped };
}

async function sendMorningReminders(env) {
  // The flag lives in wrangler.toml where turning it on is a deliberate,
  // visible act. Until then every six-o'clock firing only reports itself,
  // so the schedule can be watched across a real clock change first.
  if ((env.SMS_REMINDERS || 'off') !== 'on') {
    console.log('[sms] 06:00 in the salon — sending is switched OFF (SMS_REMINDERS != on)');
    return;
  }
  if (!env.SMSGATE_LOGIN || !env.SMSGATE_PASSWORD) {
    console.log('[sms] ABORT: gateway credentials not set (SMSGATE_LOGIN / SMSGATE_PASSWORD)');
    return;
  }
  // rdns_main_v1 sits behind the login; the database secret reads it as admin.
  if (!env.FB_SECRET) {
    console.log('[sms] ABORT: FB_SECRET not set — cannot read the appointment book');
    return;
  }
  const auth = '?auth=' + encodeURIComponent(env.FB_SECRET);
  const ymd = nicosiaYmd(new Date());

  let raw;
  try {
    const r = await fetch(`${DB}/rdns_main_v1.json${auth}`);
    if (!r.ok) { console.log('[sms] ABORT: appointment book read refused:', r.status); return; }
    raw = await r.json();
  } catch (e) { console.log('[sms] ABORT: appointment book unreachable:', String(e)); return; }
  // The panel has stored this both as an object and as a JSON string over its
  // life; accept either.
  const data = (typeof raw === 'string') ? JSON.parse(raw) : raw;

  // What already went out today, so a re-run — a redeploy at 06:05, a manual
  // trigger — can never text anybody twice.
  let sentLog = {};
  try {
    const r = await fetch(`${DB}/rdns_sms_log_v1/${ymd}.json${auth}`);
    if (r.ok) sentLog = (await r.json()) || {};
  } catch (e) { console.log('[sms] ABORT: could not read the sent log — refusing to risk doubles:', String(e)); return; }

  const picked = pickReminders(data, ymd, sentLog);
  picked.skipped.forEach(s => console.log('[sms] skip appt', s.id, '—', s.why));
  let batch = picked.send;
  // The cap is for the DAY, not the run — everything already in today's log
  // counts against it, so re-running a capped morning cannot leak past it.
  const room = Math.max(0, SMS_DAILY_CAP - Object.keys(sentLog).length);
  if (batch.length > room) {
    console.log('[sms] CAP: wanted', batch.length, 'sends with', room, 'left of today\'s', SMS_DAILY_CAP, '— look at this, it is not normal');
    batch = batch.slice(0, room);
  }
  console.log('[sms]', ymd, '—', batch.length, 'reminder(s) to send');

  const basic = 'Basic ' + btoa(env.SMSGATE_LOGIN + ':' + env.SMSGATE_PASSWORD);
  for (const m of batch) {
    // Claimed in the log BEFORE the send: if the worker dies mid-run, the
    // worst outcome is a reminder that never went, never one that went twice.
    try {
      const c = await fetch(`${DB}/rdns_sms_log_v1/${ymd}/${m.apptId}.json${auth}`, {
        method: 'PUT',
        body: JSON.stringify({ st: 'sending', to: m.phone, ts: { '.sv': 'timestamp' } }),
        headers: { 'content-type': 'application/json' }
      });
      if (!c.ok) { console.log('[sms] appt', m.apptId, 'claim refused (', c.status, ') — skipped'); continue; }
    } catch (e) { console.log('[sms] appt', m.apptId, 'claim failed — skipped:', String(e)); continue; }

    let ok = false, detail = '';
    try {
      const r = await fetch(SMSGATE_URL, {
        method: 'POST',
        headers: { 'content-type': 'application/json', authorization: basic },
        body: JSON.stringify({ textMessage: { text: m.text }, phoneNumbers: [m.phone] })
      });
      ok = r.status === 201 || r.ok;
      detail = ok ? '' : ('gateway said ' + r.status + ' ' + (await r.text()).slice(0, 200));
    } catch (e) { detail = String(e); }

    console.log('[sms] appt', m.apptId, '→', m.phone, ok ? 'sent' : 'FAILED: ' + detail);
    try {
      await fetch(`${DB}/rdns_sms_log_v1/${ymd}/${m.apptId}.json${auth}`, {
        method: 'PATCH',
        body: JSON.stringify(ok ? { st: 'sent' } : { st: 'failed', err: detail.slice(0, 200) }),
        headers: { 'content-type': 'application/json' }
      });
    } catch (e) { console.log('[sms] appt', m.apptId, 'log update failed:', String(e)); }
  }
}

/* ── the WhatsApp reminders, via Piyzi ──────────────────────────────────────
   Meta will not verify a North Cyprus business, so the salon's WhatsApp goes
   out through Piyzi's verified account instead: their API schedules a template
   message and their infrastructure sends it. Everything below is confirmed
   against the live documentation at app.piyzi.com/business/developer-tools
   (read 29 Aug 2026), not guessed from the screenshots:

       GET    /whatsapp/templates          the approved templates + examplePayload
       POST   /whatsapp/messages           send now — add scheduledAt (ISO 8601,
                                           2 min..1 year ahead) and the SAME
                                           endpoint schedules instead; there is
                                           no separate POST /whatsapp/scheduled
       GET    /whatsapp/scheduled          list planned sends
       DELETE /whatsapp/scheduled/{uid}    cancel one — 409 if already sent

   Every response is {"success":true,"data":…} or {"success":false,"error":
   {"code","message"}}. Auth is the X-Api-Key header. Rate limits per key:
   120 requests/min, 30 POSTs/min, 2000 POSTs/day — two reminders per booking
   on a ~30-customer day never gets near any of them.

   THE KEY. pyz_live_… lives ONLY as a wrangler secret (PIYZI_API_KEY). It has
   no IP restriction, so it is the only thing between the internet and the
   salon's WhatsApp number: never in this file, never in wrangler.toml, never
   logged, never echoed back in a response.

   WHICH TEMPLATES. Two are approved by Meta — a 24-hour and a 2-hour reminder
   — but their exact names and variable order are only visible through
   GET /whatsapp/templates with the real key. So they are NOT hard-coded here:
   each lives as a small JSON spec in wrangler.toml (WA_R24 / WA_R1), filled in
   once from what /wa/templates actually returns. Until then /wa/schedule
   refuses loudly instead of sending under a guessed name that would fail
   silently at Piyzi's end. */
const PIYZI = 'https://api.piyzi.com/api/v1';

/* ── the confirm page (/r/<apptId>) and its little store ────────────────────
   The "Detaylar / Details" button Meta baked into both reminder templates
   lands here. The page is the APPROVED design (rpage-source.html → rpage.js,
   regenerated by make-rpage.mjs — never edited by hand) with three data slots
   and two answers wired in.

   The data lives in this worker's own KV, pushed by the armed app behind the
   shared key — deliberately NOT read from Firebase, so no admin credential
   ever sits here. One key per appointment, and the value is the appointment's
   PUBLIC face only: date, time, service, answer state. No name, no phone, no
   price, no technician. A customer who edits the id in the URL can reach, at
   most, another booking's date and service — never a person.

   Answers are one-shot: the first tap wins, a second tap (or a second device)
   is told what was recorded rather than recording again. Each answer is also
   copied to an outbox key the app polls and acknowledges, which is how the
   answer reaches reception's dashboard and the Gap Report. */
import { R_PAGE } from './rpage.js';

const R_ID = /^\d{6,20}$/;
const rEsc = s => String(s).replace(/[&<>"']/g, c => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));

// "2 Eylül Çarşamba" from the salon-local "YYYY-MM-DDTHH:MM" — same shape the
// design's own example used ("22 Ağustos Cuma").
function rDateStr(dt) {
  const [Y, M, D] = String(dt).slice(0, 10).split('-').map(Number);
  return new Intl.DateTimeFormat('tr-TR', { timeZone: 'UTC', day: 'numeric', month: 'long', weekday: 'long' })
    .format(new Date(Date.UTC(Y, M - 1, D, 12)));
}
// The headline follows the day, on the salon's clock.
function rHeadline(dt) {
  const d = String(dt).slice(0, 10);
  if (d === nicosiaYmd(new Date())) return 'Bugün sizi bekliyoruz';
  if (d === nicosiaYmd(new Date(Date.now() + 86400e3))) return 'Yarın sizi bekliyoruz';
  return 'Sizi bekliyoruz';
}

// One template, three states: pending (ask + buttons), answered (thank-you,
// the booking still shown above it), na (details unavailable — friendly, with
// the phone number, never an error).
function rRender(state, rec) {
  const done = (rec && rec.st === 'change')
    ? { t: 'Aldık, teşekkürler', p: 'Sizi en kısa sürede arayıp yeni bir saat ayarlayacağız.<br>We will call you shortly to arrange a new time.' }
    : { t: 'Teşekkür ederiz', p: 'Randevunuz onaylandı.<br>Your appointment is confirmed.' };
  return R_PAGE
    .replace('{{BODY}}', state === 'pending' ? '' : state)
    .replace('{{HEADLINE}}', state === 'na' ? 'Sizi bekliyoruz' : rHeadline(rec.dt))
    .replace('{{DATE}}', state === 'na' ? '' : rEsc(rDateStr(rec.dt)))
    .replace('{{TIME}}', state === 'na' ? '' : rEsc(String(rec.dt).slice(11, 16)))
    .replace('{{SVC}}', state === 'na' ? '' : rEsc(rec.svc || '—'))
    .replace('{{DONE_T}}', done.t)
    .replace('{{DONE_P}}', done.p);
}
const rHtml = html => new Response(html, {
  status: 200,
  headers: { 'content-type': 'text/html; charset=utf-8', 'cache-control': 'no-store' }
});

async function handleRPage(req, env, ctx, url) {
  // POST /r/a — the customer's answer. Public by necessity (the customer has
  // no key), so it is validated to the bone: a digits-only id that already
  // exists in the store and is still unanswered, an answer that is one of two
  // words, and nothing else writable.
  if (url.pathname === '/r/a' && req.method === 'POST') {
    let b = null;
    try { b = await req.json(); } catch { /* answered below */ }
    const id = b && String(b.id || '');
    const a = b && String(b.a || '');
    if (!R_ID.test(id) || (a !== 'confirm' && a !== 'change')) return waJson({ ok: false }, 400);
    if (!env.RD_WA) return waJson({ ok: false }, 503);
    const rec = await env.RD_WA.get('c:' + id, { type: 'json' });
    if (!rec) { waLog(env, ctx, { op: 'r-answer', apptId: id, outcome: 'unknown-id' }); return waJson({ ok: false }, 404); }
    if (rec.st && rec.st !== 'pending') return waJson({ ok: true, st: rec.st, already: true });
    rec.st = a; rec.at = Date.now();
    await env.RD_WA.put('c:' + id, JSON.stringify(rec));
    await env.RD_WA.put('a:' + id, JSON.stringify({ st: a, at: rec.at }));
    waLog(env, ctx, { op: 'r-answer', apptId: id, outcome: a });
    return waJson({ ok: true, st: a });
  }

  if (req.method !== 'GET' && req.method !== 'HEAD') return reply('no', 405);
  const id = (url.pathname.match(/^\/r\/(\d{6,20})$/) || [])[1];
  const rec = (id && env.RD_WA) ? await env.RD_WA.get('c:' + id, { type: 'json' }) : null;
  if (!rec) return rHtml(rRender('na', null));
  return rHtml(rRender(rec.st && rec.st !== 'pending' ? 'answered' : 'pending', rec));
}

// The app's routes answer the browser, so they need CORS; the shared key rides
// in the x-rd-key header, which is what makes the preflight happen at all.
const WA_CORS = {
  'access-control-allow-origin': '*',
  'access-control-allow-methods': 'GET,POST,OPTIONS',
  'access-control-allow-headers': 'content-type,x-rd-key',
  'access-control-max-age': '86400',
  'cache-control': 'no-store'
};
const waJson = (obj, status = 200) =>
  new Response(JSON.stringify(obj), { status, headers: { 'content-type': 'application/json', ...WA_CORS } });

// What Piyzi expects on the wire. Reuses the SMS cleanup — digits only, local
// 0xxx and bare forms lifted to country code 90 — and returns 90XXXXXXXXXX
// (Piyzi accepts 05…, 5…, +90… and 90…; one canonical form keeps the logs
// greppable). null for anything that does not come out a plausible Turkish
// mobile: a reminder must never be fired at a mangled number.
function waPhone(raw) {
  const p = smsPhone(raw);
  return p ? p.slice(1) : null;
}

// The blocker "client" reception books to close out hours. It is not a person
// and must never receive a message, whatever number sits on the record.
function waBlockedName(name) {
  return /kapal[ıi]/i.test(String(name || ''));
}

// A salon wall-clock time → the UTC instant Piyzi wants in scheduledAt.
// Same rule as the cron above: the offset belongs to the timezone database,
// never to a hard-coded "+3" — Asia/Nicosia is +3 in summer and +2 in winter,
// and the 24-hour reminder for a booking just after a clock change crosses
// the seam. Two correction passes settle even those edge instants.
function nicosiaWallToUtc(ymd, hhmm) {
  const [Y, M, D] = String(ymd).split('-').map(Number);
  const [h, mi] = String(hhmm).split(':').map(Number);
  if (![Y, M, D, h, mi].every(Number.isFinite)) return NaN;
  const want = Date.UTC(Y, M - 1, D, h, mi);
  let t = want;
  for (let i = 0; i < 2; i++) {
    const p = new Intl.DateTimeFormat('en-GB', {
      timeZone: 'Asia/Nicosia', year: 'numeric', month: '2-digit', day: '2-digit',
      hour: '2-digit', minute: '2-digit', hour12: false
    }).formatToParts(new Date(t));
    const g = k => Number(p.find(x => x.type === k).value);
    t += want - Date.UTC(g('year'), g('month') - 1, g('day'), g('hour') % 24, g('minute'));
  }
  return t;
}

// "1 Eylül 14:00" — the human date-and-time a template variable carries,
// in Turkish and on the salon's clock, matching the docs' own example
// ("26 Ağustos 14:00").
function waWhen(utcMs) {
  return new Intl.DateTimeFormat('tr-TR', {
    timeZone: 'Asia/Nicosia', day: 'numeric', month: 'long',
    hour: '2-digit', minute: '2-digit'
  }).format(new Date(utcMs)).replace(',', '');
}

// The two reminders an appointment earns: 24 hours before and 2 hours before.
// (The short one is called r1 because that is the contract the app was
// promised; it fires 2 hours out.) One already in the past is normal for a
// same-day booking, not an error — Piyzi refuses anything nearer than 2
// minutes, so the line is drawn at 3 to not race it.
function waReminders(apptUtc, now) {
  const due = [], skipped = [];
  for (const [kind, at] of [['r24', apptUtc - 24 * 3600e3], ['r1', apptUtc - 2 * 3600e3]]) {
    if (at < now + 3 * 60e3) skipped.push({ kind, why: 'past' });
    else due.push({ kind, at });
  }
  return { due, skipped };
}

// A template spec from wrangler.toml: {"templateName":"…","languageCode":"tr",
// "header":["{name}"],"body":["{name}","{when}"]} — arrays in the template's
// own variable order, buttons as an index→value object if the template has
// them. null until it is really configured.
function waSpec(raw) {
  try {
    const s = JSON.parse(raw || '');
    return s && typeof s.templateName === 'string' && s.templateName ? s : null;
  } catch { return null; }
}

// The spec's placeholders → this appointment's values, shaped exactly like
// the documented POST /whatsapp/messages parameters block. Fields the spec
// leaves out are not sent at all — Piyzi rejects a parameters block whose
// counts differ from the template's (TEMPLATE_PARAMS_MISMATCH).
function waFill(spec, vals) {
  const sub = s => String(s).replace(/\{(name|service|date|time|when|apptId)\}/g, (_, k) => vals[k] != null ? String(vals[k]) : '');
  const parameters = {};
  if (Array.isArray(spec.header) && spec.header.length) parameters.header = spec.header.map(sub);
  if (Array.isArray(spec.body) && spec.body.length) parameters.body = spec.body.map(sub);
  if (spec.buttons && typeof spec.buttons === 'object') {
    parameters.buttons = {};
    for (const k of Object.keys(spec.buttons)) parameters.buttons[k] = sub(spec.buttons[k]);
  }
  return { templateName: spec.templateName, languageCode: spec.languageCode || 'tr', parameters };
}

// One call to Piyzi: 10-second timeout, one retry on a 5xx or a network
// failure, never on a 4xx — a 4xx will say the same thing twice and the
// retry would only spend the rate limit. Throws only if both attempts die
// on the wire.
async function piyziCall(env, method, path, body) {
  const attempt = async () => {
    const r = await fetch(PIYZI + path, {
      method,
      headers: { 'X-Api-Key': env.PIYZI_API_KEY, ...(body ? { 'content-type': 'application/json' } : {}) },
      body: body ? JSON.stringify(body) : undefined,
      signal: AbortSignal.timeout(10000)
    });
    let j = null;
    try { j = await r.json(); } catch { /* a non-JSON body is reported by status alone */ }
    return { status: r.status, body: j };
  };
  let first = null;
  try { first = await attempt(); } catch { /* fall through to the one retry */ }
  if (first && first.status < 500) return first;
  return attempt();
}

// The caller gets Piyzi's error code and message — those are diagnosis — and
// nothing else: no headers, no key, no raw request.
function piyziErr(r) {
  const e = r && r.body && r.body.error;
  return e ? { code: String(e.code || ''), message: String(e.message || '') }
           : { code: 'HTTP_' + (r ? r.status : 0), message: 'Piyzi returned an unexpected response' };
}

// Every schedule and cancel leaves a trace — apptId, kind, uid, outcome — so
// a missing reminder can be walked back afterwards. console.log reaches
// `wrangler tail`; the Firebase copy is durable but best-effort (the rules may
// refuse an unsigned write there; that must never fail the request itself).
function waLog(env, ctx, entry) {
  console.log('[wa]', JSON.stringify(entry));
  const key = (String(entry.apptId || entry.uid || 'x').replace(/[.#$/\[\]]/g, '_')
    + '-' + (entry.op || '') + '-' + Date.now());
  const auth = env.FB_SECRET ? '?auth=' + encodeURIComponent(env.FB_SECRET) : '';
  const p = fetch(`${DB}/rdns_wa_log_v1/${key}.json${auth}`, {
    method: 'PUT',
    body: JSON.stringify({ ...entry, ts: { '.sv': 'timestamp' } }),
    headers: { 'content-type': 'application/json' }
  }).catch(() => {});
  if (ctx) ctx.waitUntil(p);
}

async function handleWa(req, env, ctx, url) {
  if (req.method === 'OPTIONS') return new Response(null, { status: 204, headers: WA_CORS });

  // The same constant-time comparison as the buttons' door, but /wa/ has its
  // OWN key (WA_KEY) so the buttons' key never has to leave the buttons — the
  // two rotate independently. BTN_KEY is accepted too, so nothing breaks if
  // the owner ever uses it instead. Without either, 401 and nothing else — an
  // unauthorised caller learns no route names and no reasons.
  const k = req.headers.get('x-rd-key') || url.searchParams.get('k') || '';
  const doorOpen = (env.WA_KEY && sameKey(k, env.WA_KEY)) || (env.BTN_KEY && sameKey(k, env.BTN_KEY));
  if (!doorOpen) return new Response(null, { status: 401, headers: WA_CORS });

  if (!env.PIYZI_API_KEY) {
    return waJson({ ok: false, error: { code: 'PIYZI_KEY_NOT_SET', message: 'Run: wrangler secret put PIYZI_API_KEY' } }, 503);
  }

  const route = url.pathname;

  // ── GET /wa/templates — the setup and diagnosis window ────────────────────
  // Run once to learn the real template names and examplePayload shapes, then
  // fill WA_R24 / WA_R1 in wrangler.toml from what it says.
  if (route === '/wa/templates' && req.method === 'GET') {
    let r;
    try { r = await piyziCall(env, 'GET', '/whatsapp/templates'); }
    catch { return waJson({ ok: false, error: { code: 'PIYZI_UNREACHABLE', message: 'Piyzi did not answer within the timeout, twice' } }, 502); }
    if (!(r.body && r.body.success)) return waJson({ ok: false, error: piyziErr(r) }, r.status >= 400 ? r.status : 502);
    const names = ((r.body.data && r.body.data.templates) || []).map(t => `${t.name}/${t.language}`);
    console.log('[wa] templates on the account:', names.join(', ') || '(none)');
    return waJson({ ok: true, data: r.body.data });
  }

  // ── GET /wa/scheduled — Piyzi's pending-send list, read-only ──────────────
  // Diagnosis and recovery: when a stored uid goes missing app-side (a sync
  // snapshot can wipe an unsaved field), this is how the real uid is found
  // again instead of scheduling a duplicate. Passes through status/page/limit.
  if (route === '/wa/scheduled' && req.method === 'GET') {
    const qs = new URLSearchParams();
    for (const k of ['status', 'page', 'limit']) { const v = url.searchParams.get(k); if (v) qs.set(k, v); }
    let r;
    try { r = await piyziCall(env, 'GET', '/whatsapp/scheduled' + (qs.toString() ? '?' + qs.toString() : '')); }
    catch { return waJson({ ok: false, error: { code: 'PIYZI_UNREACHABLE', message: 'Piyzi did not answer within the timeout, twice' } }, 502); }
    if (!(r.body && r.body.success)) return waJson({ ok: false, error: piyziErr(r) }, r.status >= 400 ? r.status : 502);
    return waJson({ ok: true, data: r.body.data });
  }

  // Everything below changes state at Piyzi, so it is POST + JSON only.
  if (req.method !== 'POST') return waJson({ ok: false, error: { code: 'METHOD', message: 'POST only' } }, 405);
  let b;
  try { b = await req.json(); } catch { return waJson({ ok: false, error: { code: 'INVALID_JSON', message: 'Body is not valid JSON' } }, 400); }

  // ── POST /wa/confirm-push — the app feeds the confirm-page store ──────────
  // {items:[{id, dt, svc}]}. The value written is the appointment's public
  // face only. Same id + same dt → the record (and its answer) stands; a
  // changed dt means the booking moved, so the question is asked afresh.
  if (route === '/wa/confirm-push') {
    if (!env.RD_WA) return waJson({ ok: false, error: { code: 'NO_KV', message: 'store not bound' } }, 503);
    const items = Array.isArray(b && b.items) ? b.items.slice(0, 200) : null;
    if (!items || !items.length) return waJson({ ok: false, error: { code: 'BAD_REQUEST', message: 'Need items: [ … ]' } }, 400);
    let put = 0, kept = 0, bad = 0;
    for (const it of items) {
      const id = String((it && it.id) || '');
      const dt = String((it && it.dt) || '');
      if (!R_ID.test(id) || !/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}$/.test(dt)) { bad++; continue; }
      const svc = String((it && it.svc) || '').slice(0, 80);
      const old = await env.RD_WA.get('c:' + id, { type: 'json' });
      if (old && old.dt === dt) { kept++; continue; }
      await env.RD_WA.put('c:' + id, JSON.stringify({ dt, svc, st: 'pending', pt: Date.now() }));
      put++;
    }
    return waJson({ ok: true, put, kept, bad });
  }

  // ── POST /wa/confirm-del — a cancelled booking leaves the store ───────────
  if (route === '/wa/confirm-del') {
    if (!env.RD_WA) return waJson({ ok: false, error: { code: 'NO_KV', message: 'store not bound' } }, 503);
    const ids = Array.isArray(b && b.ids) ? b.ids.filter(x => R_ID.test(String(x))).slice(0, 200) : null;
    if (!ids || !ids.length) return waJson({ ok: false, error: { code: 'BAD_REQUEST', message: 'Need ids: [ … ]' } }, 400);
    for (const id of ids) { await env.RD_WA.delete('c:' + id); await env.RD_WA.delete('a:' + id); }
    return waJson({ ok: true, deleted: ids.length });
  }

  // ── POST /wa/answers — the outbox the app polls, and its acknowledgment ───
  // {} reads what customers have answered; {ack:[ids]} clears what the app
  // has safely written onto the appointments, so the outbox stays small.
  if (route === '/wa/answers') {
    if (!env.RD_WA) return waJson({ ok: false, error: { code: 'NO_KV', message: 'store not bound' } }, 503);
    if (Array.isArray(b && b.ack) && b.ack.length) {
      for (const id of b.ack.filter(x => R_ID.test(String(x))).slice(0, 200)) await env.RD_WA.delete('a:' + id);
      return waJson({ ok: true });
    }
    const list = await env.RD_WA.list({ prefix: 'a:' });
    const answers = [];
    for (const k of list.keys.slice(0, 100)) {
      const v = await env.RD_WA.get(k.name, { type: 'json' });
      if (v) answers.push({ id: k.name.slice(2), st: v.st, at: v.at });
    }
    return waJson({ ok: true, answers });
  }

  // ── POST /wa/schedule — the two reminders for one appointment ─────────────
  if (route === '/wa/schedule') {
    const { apptId, phone, name, dateISO, timeHHMM, service } = b || {};
    if (!apptId || !/^\d{4}-\d{2}-\d{2}$/.test(String(dateISO)) || !/^\d{2}:\d{2}$/.test(String(timeHHMM))) {
      return waJson({ ok: false, error: { code: 'BAD_REQUEST', message: 'Need apptId, dateISO (YYYY-MM-DD), timeHHMM (HH:MM)' } }, 400);
    }
    if (waBlockedName(name)) {
      waLog(env, ctx, { op: 'schedule', apptId, outcome: 'refused-blocker-client' });
      return waJson({ ok: false, error: { code: 'BLOCKED_CLIENT', message: 'KAPALI — Personel is not a customer; nothing sent' } }, 400);
    }
    const to = waPhone(phone);
    if (!to) return waJson({ ok: false, error: { code: 'INVALID_PHONE', message: 'Not a Turkish mobile number after cleanup; nothing sent' } }, 400);

    // Both specs must be real before either reminder goes: half-configured
    // must fail loudly here, not half-send and fail quietly at Piyzi.
    const specs = { r24: waSpec(env.WA_R24), r1: waSpec(env.WA_R1) };
    if (!specs.r24 || !specs.r1) {
      return waJson({ ok: false, error: { code: 'TEMPLATES_NOT_CONFIGURED', message: 'Call GET /wa/templates, then fill WA_R24 and WA_R1 in wrangler.toml and redeploy' } }, 503);
    }

    const apptUtc = nicosiaWallToUtc(dateISO, timeHHMM);
    if (!Number.isFinite(apptUtc)) return waJson({ ok: false, error: { code: 'BAD_REQUEST', message: 'dateISO/timeHHMM did not parse' } }, 400);
    const vals = { name: name || '', service: service || '', date: dateISO, time: timeHHMM, when: waWhen(apptUtc), apptId: String(apptId) };
    const plan = waReminders(apptUtc, Date.now());

    const scheduled = [], failed = [];
    for (const { kind, at } of plan.due) {
      const payload = { phone: to, ...waFill(specs[kind], vals), scheduledAt: new Date(at).toISOString() };
      let r = null, uid = null, err = null;
      try { r = await piyziCall(env, 'POST', '/whatsapp/messages', payload); } catch { /* err set below */ }
      if (r && r.body && r.body.success) uid = r.body.data && r.body.data.scheduledMessage && r.body.data.scheduledMessage.uid;
      if (uid) scheduled.push({ kind, uid });
      else { err = r ? piyziErr(r) : { code: 'PIYZI_UNREACHABLE', message: 'Piyzi did not answer within the timeout, twice' }; failed.push({ kind, error: err }); }
      waLog(env, ctx, { op: 'schedule', apptId, kind, uid: uid || null, to, at: new Date(at).toISOString(), outcome: uid ? 'scheduled' : 'failed:' + (err && err.code) });
    }
    for (const s of plan.skipped) waLog(env, ctx, { op: 'schedule', apptId, kind: s.kind, outcome: 'skipped-past' });

    if (failed.length) return waJson({ ok: false, error: failed[0].error, scheduled, skipped: plan.skipped, failed }, 502);
    return waJson({ ok: true, scheduled, skipped: plan.skipped });
  }

  // ── POST /wa/cancel — the appointment was cancelled or moved ──────────────
  // "Already sent" (409) and "already gone" (404) are successes: the caller
  // wanted it not pending, and it is not pending.
  if (route === '/wa/cancel') {
    const uids = Array.isArray(b && b.uids) ? b.uids.filter(u => typeof u === 'string' && u).slice(0, 20) : null;
    if (!uids || !uids.length) return waJson({ ok: false, error: { code: 'BAD_REQUEST', message: 'Need uids: [ … ]' } }, 400);
    const results = [];
    for (const uid of uids) {
      let r = null;
      try { r = await piyziCall(env, 'DELETE', '/whatsapp/scheduled/' + encodeURIComponent(uid)); } catch { /* counted below */ }
      const gone = !!(r && (r.status < 300 || r.status === 404 || r.status === 409));
      results.push({ uid, ok: gone, code: r ? (r.body && r.body.error ? r.body.error.code : 'OK') : 'PIYZI_UNREACHABLE' });
      waLog(env, ctx, { op: 'cancel', uid, outcome: gone ? 'cancelled' : 'failed:' + (r ? r.status : 'unreachable') });
    }
    return waJson({ ok: results.every(x => x.ok), results });
  }

  // ── POST /wa/send — immediate send (the Google review ask after checkout) ─
  if (route === '/wa/send') {
    const { phone, templateName, params, languageCode } = b || {};
    if (!templateName) return waJson({ ok: false, error: { code: 'BAD_REQUEST', message: 'Need templateName' } }, 400);
    const to = waPhone(phone);
    if (!to) return waJson({ ok: false, error: { code: 'INVALID_PHONE', message: 'Not a Turkish mobile number after cleanup; nothing sent' } }, 400);
    let r;
    try {
      r = await piyziCall(env, 'POST', '/whatsapp/messages', {
        phone: to, templateName: String(templateName), languageCode: String(languageCode || 'tr'),
        parameters: (params && typeof params === 'object') ? params : {}
      });
    } catch { return waJson({ ok: false, error: { code: 'PIYZI_UNREACHABLE', message: 'Piyzi did not answer within the timeout, twice' } }, 502); }
    const ok = !!(r.body && r.body.success);
    const messageUid = ok && r.body.data ? r.body.data.messageUid : null;
    waLog(env, ctx, { op: 'send', to, templateName: String(templateName), uid: messageUid, outcome: ok ? 'sent' : 'failed:' + piyziErr(r).code });
    if (!ok) return waJson({ ok: false, error: piyziErr(r) }, r.status >= 400 ? r.status : 502);
    return waJson({ ok: true, messageUid });
  }

  return waJson({ ok: false, error: { code: 'NOT_FOUND', message: 'No such route' } }, 404);
}

// Exported for the fixture tests beside this file — the workers runtime
// ignores named exports, and nothing else imports them.
export { nicosiaHour, nicosiaYmd, smsPhone, smsText, pickReminders, sendMorningReminders,
         waPhone, waBlockedName, nicosiaWallToUtc, waWhen, waReminders, waSpec, waFill };

export default {
  async scheduled(event, env, ctx) {
    // Two firings a day arrive here; the one for which it is actually six in
    // the morning at the salon does the work, the other leaves quietly.
    if (nicosiaHour(new Date(event.scheduledTime)) !== 6) return;
    await sendMorningReminders(env);
  },

  async fetch(req, env, ctx) {
    const url = new URL(req.url);
    if (url.pathname.startsWith('/wa/')) return handleWa(req, env, ctx, url);
    // The "Detaylar / Details" button on both approved WhatsApp templates
    // lands under /r/ — the real confirm page, public by design (customers
    // hold no key). See handleRPage.
    if (url.pathname.startsWith('/r/') || url.pathname === '/r') {
      return handleRPage(req, env, ctx, url);
    }
    if (url.pathname !== '/p') return reply('no', 404);
    if (req.method !== 'GET' && req.method !== 'HEAD') return reply('no', 405);

    const who = (url.searchParams.get('who') || '').toLowerCase().trim();
    const g   = (url.searchParams.get('g')   || '').toLowerCase().trim();
    const k   =  url.searchParams.get('k')   || '';

    // Checked in this order and before anything is written: a request without
    // the key never reaches the database at all.
    if (!env.BTN_KEY || !sameKey(k, env.BTN_KEY)) return reply('no',  403);
    if (!PEOPLE.includes(who))                    return reply('who', 400);
    // An unknown gesture — a firmware oddity, a mistyped URL — is ignored
    // quietly: logged so it can be found, answered 200 so the button does not
    // retry, and never written to the database.
    if (!GESTURES.includes(g)) {
      console.log('[btn] unknown gesture ignored:', JSON.stringify(g), 'who:', who);
      return reply('ignored', 200);
    }

    const id = crypto.randomUUID();
    const body = JSON.stringify({
      who, g,
      // The server's clock, not this worker's and definitely not the button's.
      // The boards drop a press older than two minutes, so a tablet that has
      // been asleep does not wake up and start hour-old jobs — and that check
      // is only honest if both ends are on the one clock the salon's devices
      // agree about.
      ts: { '.sv': 'timestamp' },
      src: 'shelly'
    });

    // The auth token is sent only if there is one. The salon's rules currently
    // let anyone write under timers/ — which is how the boards themselves write,
    // since they never sign in — so the press lands either way. Sending an empty
    // `auth=` would not be treated as "no token" but as a broken one, and the
    // database would refuse the write. If the timers rules are ever tightened,
    // set FB_SECRET and this starts signing the write with nothing else to change.
    const auth = env.FB_SECRET ? '&auth=' + encodeURIComponent(env.FB_SECRET) : '';

    const r = await fetch(
      `${DB}/timers/press/${id}.json?print=silent${auth}`,
      { method: 'PUT', body, headers: { 'content-type': 'application/json' } }
    );

    // 'db' back at the button means the press was good and the database refused
    // it — worth telling apart from a bad press when somebody is stood at the
    // wall wondering why the tile did not move.
    return reply(r.ok ? 'ok' : 'db', r.ok ? 200 : 502);
  }
};
