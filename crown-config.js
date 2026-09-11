/* ============================================================================
   Royal Diamond — Crown Board roster
   ----------------------------------------------------------------------------
   THIS IS THE ONE PLACE TO ADD OR REMOVE A TECHNICIAN.

   Add a line to `operators` below and everything picks her up on the next
   refresh: both TV boards (timers.html) and reception's monitor inside the main
   app. Nothing else needs editing.

       { key:'sara', name:'Sara', photo:'op-sara.png' }

   `key`   is what her jobs are filed under in Firebase. Lower case, no spaces,
           and it must never change once she has worked a day — the records
           already written are keyed by it.
   `name`  is what the boards show.
   `photo` is her picture, shown under her name on the boards and in reception's
           monitor. Drop the file next to this one and name it here. Leave it
           out and her tile simply shows no picture — nothing else changes.

   HOW LONG SHE GETS is no longer written here. Every technician runs on 60
   minutes — the one length offered in `slotChoices` below, shown on the Aylık
   page behind the owner password. A new name added here runs on 60 from her
   first minute.

   A technician who has left: take her line out and her tiles stop appearing.
   The sessions she already earned stay in Firebase for the commission.

   A technician who has left but must STAY on the books — her salary page,
   the takings history, her final pay all still read her line — keeps her
   line and gets `hiddenOnBoard: true` on it instead. That flag means one
   thing: keep her in the system, keep her off the wall board. The TV boards
   (timers.html) skip her tile; the main app, the booking page and every
   salary screen still see her exactly as before.

   A technician who has left on a KNOWN DAY also gets `leftOn: 'YYYY-MM-DD'`.
   From that day on she is no longer somebody who is working: the diary's
   staff columns, the online booking availability and the free-time finder
   ask `rosterOn(date)` below and she is not in the answer for that date or
   any later one. Every earlier date still lists her, so her old bookings and
   tills keep their column — and every screen that counts money (salary,
   Aylık, kesinti, avans, komisyon, kasa) never asks rosterOn at all, so she
   stays on all of those in full.

   ONE FILE, TWO RUNTIMES. The browser pages read it as window.CROWN, as they
   always have. The Cloudflare worker (worker/src/index.js) imports this same
   file — wrangler bundles it in at deploy — so the automatic gap-filler asks
   the very same serviceSkill, fillOrder, notBefore and gapFill written here.
   That is why the file sets a plain `var CROWN` and exposes it at the bottom:
   a change to any of those settings needs a git push for the pages AND a
   `wrangler deploy` from the worker folder for the cron. Nothing in this file
   may touch `window` or `document` at load time — the worker has neither.
   ========================================================================== */
var CROWN = {

  operators: [
    { key:'helen',  name:'Helen',  photo:'op-helen.png'  },
    /* Hannah's commission is STOPPED. From `commissionPausedSince` (that day
       included) her jobs earn no commission on any screen that counts money;
       everything she earned BEFORE that date stays exactly as it was, and her
       base salary is not touched — this is the commission only. The salary
       page says "Komisyon durduruldu" next to her name while this is on.
       To start her commission again: set commissionPaused to false. Leave
       `commissionPausedSince` where it is — it is the answer to "from when
       was it stopped". (Note: switching it back on mid-month lets the days of
       that month from the date onward earn again; if the paused stretch must
       stay unpaid, flip the flag at the start of a month or record those jobs
       as ✂️ kesinti.) */
    { key:'hannah', name:'Hannah', photo:'op-hannah.png', hiddenOnBoard: true,
      commissionPaused: true, commissionPausedSince: '2026-08-01' },
    { key:'lissa',  name:'Lissa',  photo:'op-lissa.png'  }
  ],

  /* ── How long each technician gets ──────────────────────────────────────────
     One number per technician, and it does two jobs at once:

       · the Crown Board countdown — her limit for EVERY kind of work, manicure
         and pedicure alike, so a tile is read the same way whatever she is on;
       · the online booking page — how much of her day one appointment takes,
         so the next start she is offered is this long after the last one.

     The two used to be set apart, which is how a technician could be given
     more time at the chair than the diary left room for. They are the same
     number now — 60 minutes for everyone — shown on the Aylık page behind the
     owner password.

     It is stored in Firebase at `timers/limits/<key>` so every screen agrees —
     the wall boards, reception's monitor and the customer's booking page all
     read the one value. `setSlots` below is what puts it into this object when
     it arrives; nothing writes to `slotMins` by hand.

     Doksan dakika seçeneği kaldırıldı; Firebase'de kalmış eski 90 değerleri
     normSlot testinden geçemeyip slotDefault'a, yani 60'a düşer — elle
     temizlemeye gerek yok. */
  slotChoices: [60],
  slotDefault: 60,
  slotMins: {},        // key -> 60, filled from Firebase at runtime

  /* ── When the salon is CLOSED ───────────────────────────────────────────────
     THIS IS THE ONE PLACE. The customer booking page, the Gap Report, the
     checkout calendar, auto-rebook and the diary's own save all ask
     isClosedDay() below — change these two lists and every screen follows.

     closedWeekdays — the weekly closing days, as weekday numbers:
       0=Pazar, 1=Pazartesi … 6=Cumartesi. Today that is Sunday only.

     closedDates — one-off closures: a bayram, a public holiday, a day the
     salon simply shuts. One 'YYYY-MM-DD' string per day, e.g.:

       closedDates: ['2026-10-29', '2027-01-01'],

     Add the date and the booking page greys it out with "Kapalı" the same
     as a Sunday; remove it when the day is past (stale ones are harmless —
     a date already gone blocks nothing). Bookings ALREADY in the diary on a
     date you close are never touched: the dashboard raises a 🚫 line
     listing them so reception can ring each customer.

     openDates — one-off OPENINGS: a date that falls on a weekly closing day
     but the salon opens anyway (a busy bayram week, a Sunday worked as an
     exception). Same 'YYYY-MM-DD' strings. A date here overrides the
     closedWeekdays rule for that one day and NOTHING else: every other
     Sunday stays closed, and a date that somehow sits in BOTH lists counts
     as closed — when the two disagree, the salon stays shut. Stale past
     dates are as harmless here as in closedDates. */
  closedWeekdays: [0],
  closedDates: ['2026-09-04'],   // 4 Eylül Cuma — head technician away
  openDates: ['2026-09-06'],     // 6 Eylül Pazar — open as a one-off

  /* When the salon OPENS, HH:MM. Today this drives one rule: the 2-hour
     WhatsApp reminder goes only to appointments whose one-hour phone-call
     moment falls before reception is at the desk (this time minus ten
     minutes) — everyone later gets the 1 SAAT KALA call instead. Keep in
     step with WA_OPEN in worker/wrangler.toml, which applies the same rule
     at the worker's end. */
  openTime: '08:00',

  /* THE LADDER OF START TIMES — the one place it is written.
     Every job is 60 minutes (slotDefault above), so a start on the half hour
     strands the hour after it: a 10:30 start blocks 11:00 and leaves
     11:30–12:00 too short for anybody. So a NEW start is offered on the whole
     hour only, from `first` to `last` — with one exception: from
     `lateHalfFrom` on, a :30 start is offered as well, because at the end of
     the day it strands nothing.
     This is what may be OFFERED, never what exists: the diary's columns, the
     free-time finder, the customer's booking page, the availability the
     salon publishes and the Gap Report all read it, and a booking already
     sitting on a :30 stays exactly where it is and shows exactly as before.
     If the job length ever stops being 60 minutes, change `step` here and
     nothing else. */
  starts: { first:'08:00', last:'18:00', step:60, lateHalfFrom:'17:30' },
  hmToMin: function(hm){ var p = String(hm || '').split(':'); return (+p[0] || 0) * 60 + (+p[1] || 0); },
  minToHm: function(m){ var p = function(n){ return (n < 10 ? '0' : '') + n; }; return p(Math.floor(m / 60)) + ':' + p(m % 60); },
  // May a NEW booking be offered starting at this minute of the day?
  canStartAt: function(mins){
    var s = this.starts, m = Number(mins);
    var first = this.hmToMin(s.first), last = this.hmToMin(s.last);
    if (isNaN(m) || m < first || m > last) return false;
    if ((m - first) % s.step === 0) return true;
    return m % 30 === 0 && m >= this.hmToMin(s.lateHalfFrom);
  },
  // Every start that may be offered, as minutes of the day, first to last.
  startLadder: function(){
    var out = [], s = this.starts, a = this.hmToMin(s.first), b = this.hmToMin(s.last);
    for (var m = a; m <= b; m += 30) if (this.canStartAt(m)) out.push(m);
    return out;
  },
  // The same ladder as 'HH:MM' — what the pages print and publish.
  startLadderHM: function(){ var self = this; return this.startLadder().map(function(m){ return self.minToHm(m); }); },
  // The first offered start at or after this minute; null when the day has none left.
  nextStartFrom: function(mins){
    var l = this.startLadder(), m = Number(mins) || 0;
    for (var i = 0; i < l.length; i++) if (l[i] >= m) return l[i];
    return null;
  },


  /* FILLING A GAP — how far ahead a customer must be booked before the
     fill-call list may suggest moving her into it. Moving somebody up by a
     day or two adds no booking: it relocates one and opens a fresh gap where
     she was, with no time left to re-sell it. So the list only offers a
     customer whose EXISTING booking is at least this many days after the gap
     being filled. Whole days, counted from the gap day: 3 means a gap on the
     11th is offered bookings from the 14th on. Change it here and nothing
     else. */
  fillMinDaysAhead: 3,

  /* ── WHO CAN DO WHAT, and whose empty hours are sold first ────────────────
     serviceSkill — for each GROUP of services, the technicians who perform
     it, best first. The groups are the headings of the service list the
     booking page and the diary already use (💅 MANİKÜR, 🦶 PEDİKÜR,
     👁 KİRPİK, 🤨 KAŞ, 🪒 AĞDA); serviceGroup() below sorts any service
     name into one by its wording, so "Jel Pedikür" is pedikur, "Kaş
     Laminasyon" is kas, and "Bıyık / Çene Ağda" — the lip and chin wax;
     there is no separate lip category in the list — is agda. A technician
     NOT listed under a group cannot be booked for it ANYWHERE: the diary's
     booking form, the customer booking page, the online request handler,
     Uygun Saat Bul, the fill-call list and the automatic gap-filler all ask
     canDo() below. If the only technician who can do a service is busy, the
     answer is "no availability" — nobody is substituted quietly. A service
     that fits no group ("Güzellik Uygulaması", "Diğer / Other") is open to
     everyone, and so is a name that is not a technician at all (Manager).

     fillOrder — whose empty hours the gap-filler offers FIRST. Helen is 95%
     manicures and already in demand: her gaps fill themselves. Lissa is
     growing. Hannah has the most to fill. A technician on the roster but not
     in this list is taken after the ones that are.

     notBefore — no gap-fill offers for a technician before this date: not a
     message sent before it, and not a slot of hers dated before it. Remove
     her line when the date is past (a past date blocks nothing). */
  staffPrefs: {
    serviceSkill: {
      manikur: ['helen', 'lissa', 'hannah'],
      pedikur: ['helen', 'lissa', 'hannah'],
      kirpik:  ['lissa', 'hannah'],     // Helen does not do lashes
      kas:     ['helen'],               // Helen only — Altın Oran, Kaş Boyama, Laminasyon, Microblading
      agda:    ['helen']                // Helen only — every wax, the lip/chin wax included
    },
    fillOrder: ['hannah', 'lissa', 'helen'],
    notBefore: { hannah: '2026-09-14' }
  },

  /* ── THE AUTOMATIC GAP-FILLER (worker/src/index.js, on a cron) ────────────
     It runs in the Cloudflare worker every hour 09:00–18:00 Monday to
     Saturday, with every salon device switched off: it reads the diary from
     Firebase, walks the empty hours today, tomorrow, +2 and +3 in fillOrder,
     and sends ONE customer ONE WhatsApp offer per slot — the fixed marketing
     template in worker/templates/gapfill-offer.md, no name, no variables.

     enabled   — the kill switch. false: the hourly run logs "switched off"
                 and reads nothing, sends nothing. (The app's panel also has
                 a ⏸ Durdur button that pauses it without a deploy.)
     dryRun    — ON until Bülent turns it off. true: every run works out
                 exactly what it would send, writes that list to Firebase
                 (rdns_gapfill_v1/runs, shown in the app's panel) and sends
                 NOTHING. Set it to false and `wrangler deploy` to go live.
     dailyCap  — hard ceiling of real messages per salon day, re-runs
                 included: what the day's log already holds counts against it.
     holdMinutes — an offered slot is "teklif edildi" for this long: no other
                 customer is offered it. When the time is up with no booking
                 it is released on the next run, automatically.
     daysAhead — how many days are worked, today first: 4 = today … +3.
     cooldownDays — a customer hears from the gap-filler at most once in this
                 many days, whatever the slot.
     noticeMinutes — a slot TODAY must start at least this far ahead.
     dueAfterDays / dueUntilDays — who counts as DUE. A customer with no
                 booking ahead is offered a gap only if her last visit was
                 between these many days ago: sooner and she is not due
                 yet, later and she belongs to the win-back template, not
                 to a gap. (A customer who HOLDS a booking further out is
                 offered anyway — she comes earlier — and those go first.)
     Every customer also needs a usable phone, no booking within
     fillMinDaysAhead days of the gap, no offer in the last cooldownDays and
     no offer for that same day, ever; the KAPALI blocker and anyone opted
     out (waOptOut on her record, "STOP" or "mesaj istemiyor" in her notes,
     or the panel's 🚫) are never offered anything. */
  gapFill: {
    enabled: true,
    dryRun: true,
    dailyCap: 25,
    holdMinutes: 120,
    daysAhead: 4,
    cooldownDays: 7,
    noticeMinutes: 60,
    dueAfterDays: 14,
    dueUntilDays: 120
  },

  /* Which GROUP a service name belongs to — the headings of the service list:
     'manikur' | 'pedikur' | 'kirpik' | 'kas' | 'agda', or null for a name that
     fits none ("Güzellik Uygulaması", "Diğer / Other", an old free-typed
     service). Turkish letters are folded (ş→s, ğ→g, ı→i, İ→i…) so "KİRPİK",
     "Kirpik" and "kirpik" read the same. The order matters: pedikur before
     manikur so "Jel Pedikür" is not a manicure, kirpik before manikur so
     "Kirpik Dolgu" is not an infill. */
  serviceGroup: function(service){
    var s = String(service || '').toLowerCase()
      .replace(/i̇/g, 'i').replace(/ş/g, 's').replace(/ğ/g, 'g').replace(/ı/g, 'i')
      .replace(/ö/g, 'o').replace(/ü/g, 'u').replace(/ç/g, 'c');
    if (!s.trim()) return null;
    if (/pedik|pedic/.test(s)) return 'pedikur';
    if (/kirpi|lash/.test(s)) return 'kirpik';
    if (/\bkas\b|microblad|brow/.test(s)) return 'kas';
    if (/agda|wax/.test(s)) return 'agda';
    if (/manik|manic|jel|gel|dolgu|infill|nail|french|ombre|tirnak|akrilik|acrylic|biab|builder|oje|protez/.test(s)) return 'manikur';
    return null;
  },
  // May `who` (key or name) be booked for this service? A name that is not
  // a technician (Manager, a blank) is not governed here — true. A service
  // with no group, or a group nobody has written down, is open — true. A
  // technician missing from the group's list — false, everywhere.
  canDo: function(who, service){
    var o = this.find(who);
    if (!o) return true;
    var g = this.serviceGroup(service);
    if (!g) return true;
    var list = this.staffPrefs && this.staffPrefs.serviceSkill && this.staffPrefs.serviceSkill[g];
    if (!Array.isArray(list)) return true;
    return list.indexOf(o.key) !== -1;
  },
  // Who on the day's roster can do this service, best first (serviceSkill
  // order). Empty means nobody — say "no availability", never substitute.
  skilledOn: function(service, date){
    var roster = this.rosterOn(date);
    var g = this.serviceGroup(service);
    var list = g && this.staffPrefs && this.staffPrefs.serviceSkill && this.staffPrefs.serviceSkill[g];
    if (!Array.isArray(list)) return roster;
    return list.map(function(k){ return roster.filter(function(o){ return o.key === k; })[0]; }).filter(Boolean);
  },
  // The day's roster in the order the gap-filler works it: fillOrder first,
  // then anyone on the roster the list does not name, in roster order.
  fillOrderOn: function(date){
    var roster = this.rosterOn(date);
    var order = (this.staffPrefs && this.staffPrefs.fillOrder) || [];
    var out = order.map(function(k){ return roster.filter(function(o){ return o.key === k; })[0]; }).filter(Boolean);
    roster.forEach(function(o){ if (out.indexOf(o) === -1) out.push(o); });
    return out;
  },

  /* Is the salon shut on this day? Takes a Date or anything that starts
     'YYYY-MM-DD' (a date key, a datetime string). Unreadable INPUT counts
     as open — a parse failure must never grey the whole calendar out. But a
     missing or emptied closedWeekdays list fails CLOSED: it falls back to
     Sunday, because "someone deleted a line" must never quietly open the
     salon's closing day to customers. Genuinely opening Sundays is done by
     writing the real closed days here, not by leaving the list empty. */
  isClosedDay: function(d){
    var dt = (d instanceof Date) ? d : new Date(String(d).slice(0,10) + 'T12:00:00');
    if (isNaN(dt)) return false;
    var p = function(n){ return String(n).padStart(2,'0'); };
    var key = dt.getFullYear() + '-' + p(dt.getMonth()+1) + '-' + p(dt.getDate());
    // Date lists first, and closed beats open: a one-off closure stands
    // whatever else is written, a one-off opening lifts ONLY the weekday rule.
    if ((this.closedDates || []).indexOf(key) !== -1) return true;
    if ((this.openDates || []).indexOf(key) !== -1) return false;
    var wds = (Array.isArray(this.closedWeekdays) && this.closedWeekdays.length)
      ? this.closedWeekdays : [0];
    return wds.indexOf(dt.getDay()) !== -1;
  },

  /* The kinds of job. Manicure and pedicure each have a wall screen of their
     own (?area=…); eyelashes do not — a lash job shows on BOTH boards the way
     an other-screen job always has, counting down with its own colour. That
     colour is the `color` field: any type carrying one gets its job label
     tinted with it on the wall boards and on reception's panel alike, so
     "kirpik rengi" is the same purple everywhere it appears. Every screen
     walks this object rather than naming types, so adding one here is the
     whole of adding it. */
  types: {
    manicure: { label:'Manicure',  short:'Mani',   icon:'💅' },
    pedicure: { label:'Pedicure',  short:'Pedi',   icon:'🦶' },
    lash:     { label:'Eyelashes', short:'Kirpik', icon:'👁', color:'#b8a0d8' }
  },

  warnMs: 15*60000,   // amber, and the two-note chime, at fifteen minutes left
  undoMs:  2*60000,   // a start pressed by mistake can be taken back this long

  // The limits above are what a job normally runs on, and nothing below changes
  // them. Management may set a DIFFERENT limit for one single job — either as it
  // is started or on one already running. These four are the quick buttons; an
  // "Other" box next to them takes any number of minutes. Both screens put the
  // whole thing behind the owner password, so it is management's to give: an
  // operator working the floor cannot reach it.
  customLimits: [15, 30, 45, 60],
  // The Other box is free to type in, so it needs an outer edge: a limit is a
  // whole number of minutes, and these are the bounds a typo has to stay inside.
  // Ten hours is longer than the salon is open — it is here to catch a stray
  // keypress, not to tell management what to choose.
  customLimitMin: 1,
  customLimitMax: 600,

  /* The voice the screens announce in — one place, so reception and the wall
     boards always sound like the same person.

     Turkish, and a woman's voice for preference. The catch worth knowing: the
     only Turkish voice Windows ships with — Tolga — is male, so a female
     Turkish voice has to be installed on the machine (a Windows voice pack) or
     come from Google Türkçe, which is female but served over the network. The
     prefer list names the usual female Turkish voices first (Yelda, Emel,
     Filiz, Google Türkçe), matched loosely because the full name differs from
     machine to machine.

     After the named list, ANY Turkish voice is taken before a non-Turkish one:
     a correct Turkish reading in the wrong voice still beats an English voice
     mangling the words. So on a laptop with only Tolga and no network, the
     announcement is spoken by Tolga — right language, wrong gender, never
     silent. To guarantee a woman's voice offline, install a female Turkish
     voice on the salon laptops.

     And if the machine has no Turkish voice at all, it STILL speaks — in
     whatever default voice it does have — and logs that it fell back, so we
     can tell. A silent board is far worse than an accented one: the
     announcement is how the room is told, and it must always be said. See
     pickVoice().

     The Bluetooth speaker wakes from silence by eating the first ~third of a
     second of whatever it is handed, so a name must never be the first thing
     in the stream or "Lissa" arrives as "issa". The recordings answer this
     with 400ms of real silence baked into the START of every voice/*.mp3 —
     the wake-up eats the silence, and the line itself is just the name and
     the message. The speech-engine fallback cannot carry leading silence, so
     THERE the old protection stands: its announce() texts still open with a
     throwaway word ("Canım") that can be sacrificed instead of the name.

     pitch and rate are left where the English voice had them. A Turkish voice
     may want retuning; that is done by ear, not guessed at here.

     volume sets the level of the recorded announcements (the voice/*.mp3
     files) as well as the speech-engine fallback — tune it here, by ear in
     the salon, not in the pages. */
  voice: {
    prefer: ['Yelda', 'Emel', 'Filiz', 'Google Türkçe', 'Türkçe', 'Turkish'],
    lang:   'tr-TR',
    pitch:  1.1,
    rate:   0.95,
    volume: 0.396,
    /* WHO does the talking. The line was heard twice not because anything
       said it twice, but because two devices each said it once: reception's
       laptop (index.html, wired to the speaker) and a wall board
       (timers.html) both announced. One room, two mouths.

       So the spoken line belongs to ONE device: reception's laptop. The wall
       boards keep everything else — the lead chime, the tail chime, all of
       it visual — but stay out of the sentence unless this is switched to
       true. The boards check the flag itself, so a board running an old
       cached copy of this file simply finds it missing and stays quiet —
       the safe way round. */
    boardsSpeak: false
  },

  /* The generated tones — the fifteen-minute chime, the over-the-limit alarm
     and the crown fanfare. They are synthesised at full scale so the limiter
     they pass through can do its work; this one number is then the last gain
     in the chain they all share — after the limiter, where a level set in
     front of it would mostly be compressed straight back — on reception's
     laptop and the wall boards alike, so the whole set is turned up or down
     together. Tune it here, by ear in
     the salon, not in the pages — and quieter is fine, silent is not: an
     alarm nobody hears is far worse than one that is too loud. */
  tones: {
    volume: 0.396
  },

  /* The boss ↔ reception message presets — the three one-tap buttons above
     the message box in index.html. Words only, changed here without touching
     code. This is data for reception's screen and Bülent's; the wall boards
     never read it and never show a message. */
  msgPresets: ['Beni ara', 'Geliyorum', 'Tamam'],

  /* Music, and how it gets out of the way.

     Reception's laptop feeds the Bluetooth speaker, so it is the machine that
     plays the salon's music and the machine that has to stop the music burying
     an alarm. Every sound the panel makes cuts it: the music stops dead, three
     seconds of silence pass, the announcement plays into a quiet room, and three
     seconds after the last note the music fades back up. Nothing plays underneath
     it — the announcement is not mixed over the song, it replaces it — and the
     way back is slow so the room does not notice the seam.

     The two three-second gaps are the point of it. The one in front is what
     makes the room look up: the music stopping is itself the signal, and by the
     time the chime sounds there is nothing left to talk over. The one behind
     stops the song walking back in over the tail of a sentence.

     The music itself comes off a USB stick: reception points the panel at a
     folder once and the laptop remembers which one, so it comes back on its own
     the next morning. Nothing streams, nothing needs the wifi, and there is
     nothing to sign into.  */
  music: {
    shuffle:   true,    // the DEFAULT only — the panel's 🔀 button decides per laptop
    loop:      true,
    volume:    21,      // 0-100, what it plays at normally — under the room, not in it
    duckTo:     0,      // silent, not merely quiet: nothing plays under an announcement
    fadeDownMs: 0,      // a cut, not a fade — the silence starts the instant it is asked for
    fadeUpMs:   900,    // slow, so the room does not hear it come back
    leadGapMs: 3000,    // silence BEFORE the first note, so the room looks up into quiet
    holdMs:    3000,    // silence AFTER the last note before the music is allowed back
    // What counts as music on the stick. Anything else in the folder — cover
    // art, a stray document, the player software that came with it — is ignored.
    types:     ['mp3','m4a','aac','wav','ogg','oga','opus','flac','weba','webm','mp4'],
    maxTracks: 2000,    // a stick with more than this on it is scanned this far and no further
    maxDepth:  6,       // album folders inside artist folders inside a year — but not forever
    // The permanent library: tracks are copied off the stick into the page's
    // own storage (OPFS) so the music survives every refresh without asking
    // for the folder again. Copying stops at this many megabytes and says so.
    maxLibraryMB: 2048
  },

  // Helpers both pages use, so the lookup rules live here too.
  isMusicFile: function(name){
    var m = String(name||'').toLowerCase().match(/\.([a-z0-9]+)$/);
    return !!m && this.music.types.indexOf(m[1]) !== -1;
  },
  // What the panel shows for a track: the file's name, with the extension and
  // any leading track number taken off.
  trackName: function(name){
    return String(name||'').replace(/\.[^.]+$/,'').replace(/^\s*\d{1,3}[\s._-]+/,'').trim()
      || String(name||'');
  },
  pickVoice: function(){
    try{
      var vs = (window.speechSynthesis && window.speechSynthesis.getVoices()) || [];
      // Engine not ready yet — say() then leaves u.voice unset and the browser
      // speaks in its own default. Still not silence.
      if (!vs.length) return null;
      var pref = this.voice.prefer, i, hit;
      // 1. a named voice from the prefer list — female Turkish voices first
      for (i = 0; i < pref.length; i++){
        hit = vs.filter(function(v){
          return (v.name||'').toLowerCase().indexOf(pref[i].toLowerCase()) !== -1;
        })[0];
        if (hit) return hit;
      }
      // 2. failing a name match, any voice whose language is Turkish
      var tr = vs.filter(function(v){ return /^tr\b|^tr[-_]/i.test(v.lang||''); })[0];
      if (tr) return tr;
      // 3. no Turkish voice on this machine. Speak anyway, in whatever it has,
      //    and say so in the console — silence is the one outcome worse than an
      //    accent, so this never returns nothing when a voice exists.
      var fb = vs.filter(function(v){ return v.default; })[0] || vs[0] || null;
      try{ console.warn('[voice] no Turkish voice installed — falling back to',
                        fb && fb.name, '(' + (fb && fb.lang) + ')'); }catch(e){}
      return fb;
    }catch(e){ return null; }
  },
  find: function(who){
    if (!who) return null;
    var k = String(who).trim().toLowerCase();
    return this.operators.filter(function(o){
      return o.key === k || o.name.toLowerCase() === k;
    })[0] || null;
  },
  // Who is WORKING on the day given — the roster minus anyone whose leftOn is
  // on or before that day. `date` is 'YYYY-MM-DD' (a Date is accepted and read
  // in local time); asked without one it answers for today. An operator with
  // no leftOn is always in; one with leftOn is in for every day BEFORE it and
  // out from that day on, so a past date keeps her column and a future one
  // does not. This is the ONLY question the diary asks about who works; the
  // money screens read `operators` whole and never come through here.
  rosterOn: function(date){
    var d;
    if (date instanceof Date && !isNaN(date)) {
      var p = function(n){ return (n < 10 ? '0' : '') + n; };
      d = date.getFullYear() + '-' + p(date.getMonth() + 1) + '-' + p(date.getDate());
    } else {
      d = String(date || '').slice(0, 10);
    }
    if (!/^\d{4}-\d{2}-\d{2}$/.test(d)) {
      var t = new Date(), q = function(n){ return (n < 10 ? '0' : '') + n; };
      d = t.getFullYear() + '-' + q(t.getMonth() + 1) + '-' + q(t.getDate());
    }
    return this.operators.filter(function(o){
      var left = String(o.leftOn || '').slice(0, 10);
      return !left || d < left;
    });
  },
  // Does `who` earn NO commission on the day given? True only while her
  // commissionPaused flag is up AND the day is on or after the date it was
  // raised — never before it, so nothing already earned is ever touched.
  // `day` is 'YYYY-MM-DD'; asked without a day it answers for right now,
  // i.e. simply "is she paused". Every screen that counts commission money
  // asks this one question, so switching the flag off switches all of it.
  commissionPausedOn: function(who, day){
    var o = this.find(who);
    if (!o || !o.commissionPaused) return false;
    var since = String(o.commissionPausedSince || '').slice(0, 10);
    if (!since || !day) return true;
    return String(day).slice(0, 10) >= since;
  },
  // Anything that is not an offered length is not a choice — a stray value
  // out of Firebase, an old 90 from before the option was removed, a typo in
  // the console — and comes back null so the caller falls through to the
  // default.
  normSlot: function(v){
    var n = Number(v);
    return this.slotChoices.indexOf(n) !== -1 ? n : null;
  },
  // Her chosen length, by key or by name. Never returns nothing: a technician
  // nobody has set yet runs on the default, which is how a newly added name
  // works from her first minute without anybody visiting the settings page.
  slotFor: function(who){
    var o = this.find(who);
    if (!o) return this.slotDefault;
    return this.normSlot(this.slotMins[o.key]) || this.slotDefault;
  },
  // The whole map, replaced at once, from whatever Firebase last sent. Every
  // technician on the roster comes out with a real number whether she was in
  // the incoming data or not, so no caller has to think about a missing key.
  setSlots: function(map){
    var out = {}, self = this;
    this.operators.forEach(function(o){
      out[o.key] = self.normSlot(map && map[o.key]) || self.slotDefault;
    });
    this.slotMins = out;
    return out;
  },
  // Kept for callers that ask per kind of work. There is one limit now and it
  // covers both, so `type` is accepted and ignored rather than made a lie of.
  limitFor: function(who, type){
    return this.slotFor(who);
  },
  // Every custom limit — quick button or typed into the Other box — comes
  // through here, and it is the only thing that decides what counts as one.
  // Nothing chosen, a stray word, a number outside the bounds above: all come
  // back null, and the caller carries on with her automatic limit untouched.
  customLimit: function(min){
    if (min == null || min === '') return null;
    var m = Number(String(min).trim().replace(',', '.'));
    if (!isFinite(m)) return null;
    m = Math.round(m);
    if (m < this.customLimitMin || m > this.customLimitMax) return null;
    return m;
  }
};
// The same object for whoever loaded the file: the pages as window.CROWN,
// the worker (which has no window) as globalThis.CROWN. See the note at the
// top of the file.
if (typeof window !== 'undefined') window.CROWN = CROWN;
else if (typeof globalThis !== 'undefined') globalThis.CROWN = CROWN;
