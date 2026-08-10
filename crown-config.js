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

  // Helpers both pages use, so the lookup rules live here too.
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
