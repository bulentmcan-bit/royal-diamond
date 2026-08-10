/* ============================================================================
   Royal Diamond — Crown Board roster
   ----------------------------------------------------------------------------
   THIS IS THE ONE PLACE TO ADD OR REMOVE A TECHNICIAN.

   Add a line to `operators` below and everything picks her up on the next
   refresh: both TV boards (timers.html) and reception's monitor inside the main
   app. Nothing else needs editing.

       { key:'sara', name:'Sara', manicure:90, pedicure:60, photo:'op-sara.png' }

   `key`   is what her jobs are filed under in Firebase. Lower case, no spaces,
           and it must never change once she has worked a day — the records
           already written are keyed by it.
   `name`  is what the boards show.
   The two numbers are her crown limits in minutes: how long she has for a
   manicure and for a pedicure before the crown is lost.
   `photo` is her picture, shown under her name on the boards and in reception's
           monitor. Drop the file next to this one and name it here. Leave it
           out and her tile simply shows no picture — nothing else changes.

   A technician who has left: take her line out and her tiles stop appearing.
   The sessions she already earned stay in Firebase for the commission.
   ========================================================================== */
window.CROWN = {

  operators: [
    { key:'helen',  name:'Helen',  manicure:60, pedicure:60, photo:'op-helen.png'  },
    { key:'hannah', name:'Hannah', manicure:90, pedicure:60, photo:'op-hannah.png' },
    { key:'lissa',  name:'Lissa',  manicure:90, pedicure:60, photo:'op-lissa.png'  }
  ],

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
    pitch:  1.4,
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
  limitFor: function(who, type){
    var o = this.find(who);
    return o ? (o[type] || 60) : 60;
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
