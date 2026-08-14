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

     Female and English by preference. The list is tried in order and the first
     one the device actually has wins, matched loosely on the name because the
     full names differ from machine to machine ("Microsoft Hazel - English
     (United Kingdom)" on this one). Hazel and Susan are installed with Windows
     and speak without a network; the Google voices are served over one, so they
     come after — an alarm must not need the wifi to be up. Nothing female
     installed at all and it falls back to any English voice rather than going
     silent.

     Bright and lively rather than a newsreader: pitched up and a little quick,
     which also helps it cut through a room with dryers running. */
  voice: {
    prefer: ['Hazel', 'Susan', 'Zira', 'UK English Female', 'US English'],
    lang:   'en-GB',
    pitch:  2.0,
    rate:   1.1,
    volume: 1
  },

  /* Music, and how it gets out of the way.

     Reception's laptop feeds the Bluetooth speaker, so it is the machine that
     plays the salon's music and the machine that has to stop the music burying
     an alarm. Every sound the panel makes ducks it: the music slides down, the
     sound plays in full over the top, and the music comes back up. Down fast so
     nothing is lost under it, up slowly so the room does not notice the seam.

     The music itself comes off a USB stick: reception points the panel at a
     folder once and the laptop remembers which one, so it comes back on its own
     the next morning. Nothing streams, nothing needs the wifi, and there is
     nothing to sign into.  */
  music: {
    shuffle:   true,
    loop:      true,
    volume:    35,      // 0-100, what it plays at normally
    duckTo:     5,      // 0-100, what it drops to while a sound is playing
    fadeDownMs: 220,    // quick, so the first note is never buried
    fadeUpMs:   900,    // slow, so the room does not hear it come back
    holdMs:     350,    // a breath after the sound before the music returns
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
      if (!vs.length) return null;
      var pref = this.voice.prefer, i, hit;
      for (i = 0; i < pref.length; i++){
        hit = vs.filter(function(v){
          return (v.name||'').toLowerCase().indexOf(pref[i].toLowerCase()) !== -1;
        })[0];
        if (hit) return hit;
      }
      var en = vs.filter(function(v){ return /^en\b|^en[-_]/i.test(v.lang||''); });
      // anything that calls itself female, then any English voice at all
      return en.filter(function(v){ return /female/i.test(v.name||''); })[0] || en[0] || null;
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
