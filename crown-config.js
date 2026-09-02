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
   ========================================================================== */
window.CROWN = {

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
    { key:'hannah', name:'Hannah', photo:'op-hannah.png',
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
