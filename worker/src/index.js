/* ============================================================================
   Royal Diamond — the wall buttons' relay
   ----------------------------------------------------------------------------
   One Shelly Button1 on the wall by each technician's station. A press starts
   or finishes her job on the Crown Board, with no phone and no screen.

       double press   start a manicure
       triple press   start a pedicure
       hold ~2s       finish the job she is on
       single press   NOTHING, on purpose, so a knock or a lean cannot file a job

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
   PEOPLE below, and her three URLs typed into her button. No change to the
   board.

   THE TWO SECRETS are wrangler secrets and are never in this repo — this folder
   is published as a public website. See README.md.
   ========================================================================== */

// Must match the operator keys in crown-config.js. A name that is on the button
// but not in here is refused at the door, so a button pointed at somebody who
// has left cannot quietly file jobs for her.
const PEOPLE = ['helen', 'hannah', 'lissa'];

const GESTURES = ['double', 'triple', 'long'];

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

// Exported for the fixture tests beside this file — the workers runtime
// ignores named exports, and nothing else imports them.
export { nicosiaHour, nicosiaYmd, smsPhone, smsText, pickReminders, sendMorningReminders };

export default {
  async scheduled(event, env, ctx) {
    // Two firings a day arrive here; the one for which it is actually six in
    // the morning at the salon does the work, the other leaves quietly.
    if (nicosiaHour(new Date(event.scheduledTime)) !== 6) return;
    await sendMorningReminders(env);
  },

  async fetch(req, env) {
    const url = new URL(req.url);
    if (url.pathname !== '/p') return reply('no', 404);
    if (req.method !== 'GET' && req.method !== 'HEAD') return reply('no', 405);

    const who = (url.searchParams.get('who') || '').toLowerCase().trim();
    const g   = (url.searchParams.get('g')   || '').toLowerCase().trim();
    const k   =  url.searchParams.get('k')   || '';

    // Checked in this order and before anything is written: a request without
    // the key never reaches the database at all.
    if (!env.BTN_KEY || !sameKey(k, env.BTN_KEY)) return reply('no',  403);
    if (!PEOPLE.includes(who))                    return reply('who', 400);
    if (!GESTURES.includes(g))                    return reply('g',   400);

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
