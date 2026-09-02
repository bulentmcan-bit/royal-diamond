# The wall buttons

One Shelly Button1 by each technician's station. A press starts or finishes her
job on the Crown Board — no phone, no screen, nothing to log into.

| Press | What happens |
|---|---|
| Double | Start a manicure |
| Triple | Start a pedicure |
| Hold ~2 seconds | Finish the job she is on |
| Single | **Nothing**, on purpose — a knock or a lean must not file a job |

Two pieces make it work, and this folder is the first of them:

1. **`src/index.js`** — a Cloudflare Worker. The button can only fetch a fixed
   web address; this receives that fetch and writes the press to Firebase.
2. **The listener at the bottom of `timers.html`** — every open board watches
   `timers/press`, one of them claims each press, and turns it into the same
   `CrownBoard` call the on-screen buttons make.

Nothing else changed. A press on the wall and a press on the glass start the
same job and are filed the same way.

---

## Deploying the worker

From this folder:

```
npm install -g wrangler      # once
wrangler login               # once, opens a browser — click Allow within 2 min
wrangler deploy              # creates the worker; prints the address
wrangler secret put BTN_KEY  # paste the shared key
```

Deploy first, key second, and nothing is exposed in between: with no `BTN_KEY`
set the worker refuses every request with a 403, including one carrying the
right key. There is no window where it is open.

`FB_SECRET` is deliberately **not** set — see below.

Already deployed, at `https://rd-buttons.royaldiamond.workers.dev`. That
address, plus `/p?who=…&g=…&k=…`, is what goes into the buttons.

If the account has never published a worker, the first deploy stops to say it
needs a workers.dev subdomain. It is registered: `royaldiamond`.

### The two secrets

Neither is ever written into this repo. **This folder is published as a public
website** — anything committed here can be downloaded by anyone who knows the
file name, which is why they are wrangler secrets and not lines in a file.

| Secret | What it is |
|---|---|
| `BTN_KEY` | The shared key on the end of every button's URL. Any request without it is refused before the database is touched. Make it long and random. |
| `FB_SECRET` | Would let the worker sign its write to Firebase. **Optional, and currently unset on purpose** — see below. |

### FB_SECRET: optional, and why

**It is not needed today, and setting it wrong is worse than leaving it out.**

The starting assumption was that the board writes to Firebase as a signed-in
user and the worker would need its own way in. That turned out to be wrong in
both halves. `timers.html` loads no authentication library at all — it never
signs in — and the database rules let anyone read and write under `timers/`.
That is how the boards have always filed jobs. Checked against the live
database: an unauthenticated `PUT` to `timers/press` succeeds, while the same
write at the database root is refused, so the opening is real but scoped to that
one subtree.

So the worker sends no token, the write lands, and the boards can claim it.
`BTN_KEY` is what actually guards the worker; `FB_SECRET` would add nothing,
because anyone who can reach the worker's database path can already reach the
database path directly.

Leave `FB_SECRET` unset. The worker omits `auth=` entirely when it is missing —
deliberately, because an empty `auth=` reads to Firebase as a malformed token
and the write is refused, which would look exactly like a broken button.

**When it does become needed.** If the `timers/` rules are ever tightened, set
it and nothing else changes:

- *Legacy database secret* — Firebase console → Project settings → Service
  accounts → Database secrets. One line, still works, marked legacy by Google
  and absent from some newer projects.
- *Service account JWT* — the worker signs a JWT, swaps it for an access token,
  caches it for its ~50 minutes. About forty more lines, and the correct
  long-term answer.

Tightening those rules is a two-part job and this is the second part: the boards
need a real sign-in **first**, or they lose the database the moment the rule
lands. See the warning below.

### Database rules: nothing to change, and one change never to make

The worker writes to `timers/press/<id>`, and every board reads, claims and
deletes there. The rules are written at the `timers` level, not child by child,
so `press` is already covered and **no rules change is needed** to make the
buttons work.

**Do not add this rule, or anything like it:**

```json
"press": { ".read": "auth != null", ".write": "auth != null" }
```

It reads as the safe, obvious thing to do and it would take the boards offline.
`auth != null` means "only signed-in users", and the boards are not signed in —
`timers.html` does not even load `firebase-auth`. Presses would keep arriving
and no board would ever act on one. Nothing on screen would look broken, which
makes it an expensive afternoon: the fault looks like it is in the buttons, the
batteries or the wifi, and all of those are fine.

Securing the `timers/` subtree is worth doing, but in this order: give the
boards a sign-in (load `firebase-auth-compat`, `signInAnonymously` at startup),
confirm every screen still files jobs, and only then tighten the rules — and set
`FB_SECRET` in the same change, or the worker stops writing at that moment too.

---

## Setting up a button

In the Shelly app: the device → the chain-link icon (Actions). The Button1 is
first-generation, so the events are named:

| Shelly event | URL to set | What it does |
|---|---|---|
| `shortpush` | `https://rd-buttons.royaldiamond.workers.dev/p?who=lissa&g=single&k=<BTN_KEY>` | starts a manicure |
| `double_shortpush` | `https://rd-buttons.royaldiamond.workers.dev/p?who=lissa&g=double&k=<BTN_KEY>` | starts a pedicure |
| `triple_shortpush` | `https://rd-buttons.royaldiamond.workers.dev/p?who=lissa&g=triple&k=<BTN_KEY>` | starts the eyelashes |
| `longpush` | `https://rd-buttons.royaldiamond.workers.dev/p?who=lissa&g=long&k=<BTN_KEY>` | finishes her job |

(Remapped 25 Aug 2026 — every gesture now does something. A button configured
to the OLD mapping — single empty, double=manicure, triple=pedicure — files the
wrong kind of job on every press, so when the buttons arrive they are set up to
THIS table, all four URLs.)

Only `who=` changes from button to button. Also set **long push duration to
about 2000 ms** in the device settings, so "hold it for two seconds" is what
actually happens.

## Adding technician six

1. Her line in `crown-config.js`, the same as always.
2. Her key in `PEOPLE` at the top of `src/index.js`, then `wrangler deploy`.
3. Her four URLs typed into her button, with her `who=`.

The board is not redeployed and nothing in Firebase changes shape.

---

## How a press is kept honest

Three things can go wrong with a press arriving over the air, and each is
handled at the point it happens:

**Two boards, one press.** The manicure screen and the pedicure screen are both
open and both see it. Without a claim, one press would start two jobs and the
commission would be paid twice. Each board runs a transaction on the press: the
first to write `by` owns it, acts, and deletes it. The rest find `by` already
set — or the press already gone — and do nothing.

**A stale press.** A tablet asleep for an hour must not wake and start hour-old
jobs. Anything older than two minutes is dropped. Both ends of that measurement
are on the server's clock — `ts` is written by Firebase, and the board corrects
its own clock against the server before comparing — because the salon's screens
are minutes apart from each other.

**A press nobody is there for.** If no board is open, it simply expires. The
next board to open sweeps it on the way past.

## Testing, on the branch and not on `main` mid-shift

1. Double press → a manicure starts, for the right technician, on the right screen.
2. Triple press → a pedicure starts.
3. Hold two seconds → the job finishes, and the crown is awarded if she was inside her limit.
4. Single press → **nothing happens anywhere**.
5. Two boards open at once → one press starts exactly **one** job.
6. Press with every board closed, open one five minutes later → the job does **not** start.
7. Wrong or missing `k=` → 403 back, and nothing written to Firebase.
8. `who=` somebody not in `PEOPLE` → 400 back, and nothing written.
9. Double press twice in quick succession → the second files the first job and starts a fresh one. That is existing `startJob` behaviour, worth confirming still holds.

Tests 7 and 8 can be done from any browser — paste the URL in and read the
status. The rest need the button.

## Batteries

Rated at roughly 3000 presses a charge: six technicians at twenty presses a day
is about five months a button. That is six charge cycles to remember, falling at
random times. Shelly Cloud reports the battery for each device — worth putting
somewhere already looked at, the board footer or the salon dashboard, rather
than finding out because a button quietly stopped working. Not needed for the
first two buttons; do it before the third.

## Not in scope

- **Which client is in the chair.** The button says a manicure started, not who
  it is for. Tying presses to appointments is separate work.
- **Undoing a press from the button.** Corrections stay on the board.

---

# The WhatsApp reminders (routes under `/wa/`)

Meta will not verify a North Cyprus business, so WhatsApp goes out through
**Piyzi's** verified account: this worker talks to their API
(`api.piyzi.com/api/v1`, header `X-Api-Key`). All routes sit behind a shared
key — sent as an `x-rd-key` header (or `k=` in the URL), anything without it
gets a bare 401. The `/wa/` routes have their **own** key, the wrangler secret
`WA_KEY`, so the buttons' key never leaves the buttons (`BTN_KEY` is accepted
too, and the two rotate independently):

| Route | Does |
|---|---|
| `GET /wa/templates` | Proxies the approved-template list. Run once for setup, and for diagnosis. |
| `POST /wa/schedule` | `{apptId, phone, name, dateISO, timeHHMM, service}` → schedules the 24-hour and 2-hour reminders at Piyzi; returns `{ok:true, scheduled:[{kind:"r24",uid},{kind:"r1",uid}]}`. A reminder whose send time is already past is skipped as normal (same-day booking). **Store the uids** — they are the only way to cancel. |
| `POST /wa/confirm-booking` | `{apptId, phone, dateISO, timeHHMM}` (+ optional `name` for the KAPALI check) → sends `pyz_appointment_booked_v2` **immediately** — no scheduledAt. The worker itself words `{{1}}` as the Turkish long date ("2 Eylül Çarşamba") and passes `{{2}}` as the hour; returns `{ok:true, messageUid}`. The app stores the uid on the appointment (`wa.c`) and enforces one confirmation per customer per day via the carrier grouping. |
| `POST /wa/cancel` | `{uids:[…]}` → cancels each; "already sent" and "already gone" count as success. |
| `POST /wa/send` | `{phone, templateName, params}` → immediate send (the Google-review ask after checkout). |

Phone numbers are normalised to `90XXXXXXXXXX`; anything that does not
normalise to a Turkish mobile is refused rather than sent. The blocker client
KAPALI — Personel is refused by name. Every schedule and cancel is logged
(apptId, kind, uid, outcome) — `wrangler tail` shows it live, and a best-effort
copy goes to `rdns_wa_log_v1` in Firebase.

**The answers outbox never lists.** `POST /wa/answers` used to
`KV.list({prefix:'a:'})` on every poll — once a minute from every open tab —
and the free tier allows 1,000 list operations a day: three tabs burn that
before lunch (2 Sep 2026, it happened). The pending answers now also live as
one JSON document under `idx:answers`, updated by every write (`/r/a` adds,
ack and `/wa/confirm-del` remove) and read with a single get (100,000/day
allowance). The per-answer `a:` keys stay as the durable truth; the nightly
cron rebuilds the index from them — the worker's only remaining `list()`, one
a day. And a KV refusal now answers **503 `KV_UNAVAILABLE`** instead of an
empty array, because a blocked store must never look like a quiet day; the
app shows a red toast for it, at most once an hour.

## The Piyzi key

`pyz_live_…` from app.piyzi.com → My Business → Developer Tools. It has **no IP
restriction**, so it is the only thing protecting the salon's WhatsApp number.
It lives ONLY as a wrangler secret — never in this repo (public website!),
never in wrangler.toml, never in a log line. Set it yourself, from this folder:

```
wrangler secret put PIYZI_API_KEY     # paste the key when asked
```

Until it is set, every `/wa/` route answers 503 `PIYZI_KEY_NOT_SET`.

## First test, before the app touches any of this

```
curl -H "x-rd-key: <BTN_KEY>" https://rd-buttons.royaldiamond.workers.dev/wa/templates
```

`{"ok":true,"data":{"templates":[…]}}` back means the whole chain works —
worker → Piyzi → WhatsApp. Each template in the list shows its real `name`,
`language`, variable counts and a ready `examplePayload`.

## The two reminder templates (wired 29 Aug 2026, from the live list)

Each is a one-line JSON spec in `wrangler.toml` — `WA_R24` for
`pyz_randevu_hatirlatma_24saat`, `WA_R1` for `pyz_randevu_hatirlatma_2saat`.
Both approved templates carry exactly **one body variable (the hour)** and
**one dynamic URL button** whose link is baked at Meta as this worker's own
`/r/{{1}}` — the spec passes the apptId there, and the `/r/` route serves a
small branded "your appointment is on record, call 0548 893 3333" page so the
customer's "Detaylar / Details" tap never lands on a 404.

A third spec, `WA_CONF` (wired 2 Sep 2026), is the **booking confirmation**:
`pyz_appointment_booked_v2`, two body variables — `{{1}}` the Turkish long
date (`{dateLong}`, "2 Eylül Çarşamba") and `{{2}}` the hour. It is sent the
moment a booking is made through `POST /wa/confirm-booking`, which replaced
the wa.me tab reception used to open and send by hand.

If a template is ever re-approved under a new name or with different
variables, re-run the `/wa/templates` curl and update the spec (placeholders:
`{name}` `{service}` `{date}` `{dateLong}` `{time}` `{when}` `{apptId}`), then
`wrangler deploy`. If a spec ever goes missing or breaks, `/wa/schedule` and
`/wa/confirm-booking` refuse with `TEMPLATES_NOT_CONFIGURED` — deliberately
loud, instead of sending under a wrong name that would fail silently at
Piyzi's end.

The app side lives in index.html (WA-SLICE markers): every booking schedules
its own reminders and fires its own immediate confirmation
(`rdWaConfirmBooking` — one per customer per day, uid kept on `wa.c`), every
cancellation or move kills the pending reminders, dormant per device until
the shared key is pasted in via the 🤖 button on the dashboard.
