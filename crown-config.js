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

   HOW LONG SHE GETS is no longer written here. Each technician runs on 60 or 90
   minutes, and management sets which on the Aylık page, behind the owner
   password — see `slotChoices` below. A new name added here starts on 60 until
   somebody chooses otherwise.

   A technician who has left: take her line out and her tiles stop appearing.
   The sessions she already earned stay in Firebase for the commission.
   ========================================================================== */
window.CROWN = {

  operators: [
    { key:'helen',  name:'Helen',  photo:'op-helen.png'  },
    { key:'hannah', name:'Hannah', photo:'op-hannah.png' },
    { key:'lissa',  name:'Lissa',  photo:'op-lissa.png'  }
  ],

  /* ── How long each technician gets ──────────────────────────────────────────
     One number per technician, and it does two jobs at once:

       · the Crown Board countdown — her limit for EVERY kind of work, manicure
         and pedicure alike, so a tile is read the same way whatever she is on;
       · the online booking page — how much of her day one appointment takes,
         so the next start she is offered is this long after the last one.

     The two used to be set apart, which is how a technician could be given 90
     minutes at the chair and still be offered a booking an hour later. They are
     the same number now, chosen on the Aylık page behind the owner password.

     It is stored in Firebase at `timers/limits/<key>` so every screen agrees —
     the wall boards, reception's monitor and the customer's booking page all
     read the one value. `setSlots` below is what puts it into this object when
     it arrives; nothing writes to `slotMins` by hand. */
  slotChoices: [60, 90],
  slotDefault: 60,
  slotMins: {},        // key -> 60 | 90, filled from Firebase at runtime

  // The two kinds of job. A board is one of these; so is a tile's colour.
  types: {
    manicure: { label:'Manicure', short:'Mani', icon:'💅' },
    pedicure: { label:'Pedicure', short:'Pedi', icon:'🦶' }
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
    volume: 0.36
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
    volume: 0.36
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
    shuffle:   true,
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
    maxDepth:  6        // album folders inside artist folders inside a year — but not forever
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
  // Anything that is not one of the two offered lengths is not a choice — a
  // stray value out of Firebase, an old record, a typo in the console — and
  // comes back null so the caller falls through to the default.
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
