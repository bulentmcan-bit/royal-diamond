/* ============================================================================
   Royal Diamond — Crown Board roster
   ----------------------------------------------------------------------------
   THIS IS THE ONE PLACE TO ADD OR REMOVE A TECHNICIAN.

   Add a line to `operators` below and everything picks her up on the next
   refresh: both TV boards (timers.html) and reception's monitor inside the main
   app. Nothing else needs editing.

       { key:'sara', name:'Sara', manicure:90, pedicure:60 }

   `key`   is what her jobs are filed under in Firebase. Lower case, no spaces,
           and it must never change once she has worked a day — the records
           already written are keyed by it.
   `name`  is what the boards show.
   The two numbers are her crown limits in minutes: how long she has for a
   manicure and for a pedicure before the crown is lost.

   A technician who has left: take her line out and her tiles stop appearing.
   The sessions she already earned stay in Firebase for the commission.
   ========================================================================== */
window.CROWN = {

  operators: [
    { key:'helen',  name:'Helen',  manicure:60, pedicure:60 },
    { key:'lissa',  name:'Lissa',  manicure:90, pedicure:60 },
    { key:'hannah', name:'Hannah', manicure:90, pedicure:60 }
  ],

  // The two kinds of job. A board is one of these; so is a tile's colour.
  types: {
    manicure: { label:'Manicure', short:'Mani', icon:'💅' },
    pedicure: { label:'Pedicure', short:'Pedi', icon:'🦶' }
  },

  warnMs: 15*60000,   // amber, and the two-note chime, at fifteen minutes left
  undoMs:  2*60000,   // a start pressed by mistake can be taken back this long

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
  }
};
