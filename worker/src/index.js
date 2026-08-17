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

/* ── the 06:00 appointment reminders ─────────────────────────────────────────
   The cron fires at 03:00 AND 04:00 UTC (see wrangler.toml), because 06:00 in
   the salon is a different UTC hour summer and winter. The decision of which
   firing is real belongs to the timezone database, never to a fixed offset —
   a hard-coded "+3" is exactly the bug that would move the reminders to five
   in the morning the week the clocks go back. */
function nicosiaHour(now) {
  return Number(new Intl.DateTimeFormat('en-GB', {
    timeZone: 'Asia/Nicosia', hour: 'numeric', hour12: false
  }).format(now));
}

async function sendMorningReminders(env) {
  // Filled in when the 360dialog channel is live: read today's appointments
  // out of Firebase and send each customer the approved randevu_hatirlatma
  // template. Until then, the six-o'clock firing only says it was here — so
  // the schedule can be watched in the logs across a real clock change before
  // anything rides on it.
  console.log('[reminders] 06:00 in the salon — sender not wired up yet');
}

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
