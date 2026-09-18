// ═════════════════════════════════════════════════════════════════════════
// Online bookings, visible without a report.
//
// Reception has been stamping every accepted booking-page appointment with
// online:true for months, and nothing ever showed it. Bulent could not answer
// "is the booking page working?" without going into reports, so in practice
// nobody asked. This pins the two functions that put the answer in front of
// him: the badge on the appointment, and the today/this-week tally beside the
// date on the dashboard.
//
// It also pins the counting rules that are easy to get quietly wrong:
// a cancelled booking is not a booking, the week is Monday to Sunday and
// includes both ends, and rubbish in the diary is skipped rather than thrown.
//
//   node tests/online-marker.test.js
//
// No browser and no network: the functions are lifted straight out of
// index.html and run against a diary built around today.
// ═════════════════════════════════════════════════════════════════════════
const fs=require('fs'), vm=require('vm');
const path=require('path');
const html=fs.readFileSync(path.join(__dirname,'..','index.html'),'utf8');
const a=html.indexOf('var RD_SRC_ICON');
const b=html.indexOf('function renderAppts(){');
const ctx={ Date, String, Number, Object, console }; vm.createContext(ctx);
vm.runInContext(html.slice(a,b) + '\n;__x={mark:rdOnlineMark,tally:rdOnlineTally};', ctx);
const api=ctx.__x;

let fail=0;
const is=(g,w,what)=>{ if(JSON.stringify(g)===JSON.stringify(w)) console.log('  ok  '+what);
  else { fail++; console.log('  FAIL '+what+'\n     wanted '+JSON.stringify(w)+'\n     got    '+JSON.stringify(g)); } };

// marks
is(api.mark(null), '', 'nothing for a missing appointment');
is(api.mark({}), '', 'nothing for a desk booking');
is(api.mark({online:true}).includes('🌐'), true, 'a plain online booking wears the globe');
is(api.mark({online:true}).includes('INSTAGRAM'), false, 'and names no source');
const ig=api.mark({online:true,src:'instagram'});
is(ig.includes('📷')&&ig.includes('INSTAGRAM'), true, 'instagram is named and gets its own icon');
is(api.mark({online:true,src:'weird-thing'}).includes('🌐'), true, 'an unknown source still shows as online');

// tally — build a diary around a fixed "now"
const now=new Date();
const at=(dayOffset,h)=>{ const d=new Date(now.getFullYear(),now.getMonth(),now.getDate()+dayOffset,h||10);
  const p=n=>String(n).padStart(2,'0');
  return d.getFullYear()+'-'+p(d.getMonth()+1)+'-'+p(d.getDate())+'T'+p(d.getHours())+':00'; };
const dow=(now.getDay()+6)%7;                 // 0 = Monday
ctx.appointments=[
  {datetime:at(0,9),  online:true,  status:'confirmed'},
  {datetime:at(0,11), online:true,  status:'confirmed', src:'google'},
  {datetime:at(0,13),                status:'confirmed'},
  {datetime:at(0,15), online:true,  status:'cancelled'},          // cancelled: never counted
  {datetime:at(-dow,10), online:true, status:'confirmed'},         // Monday of this week
  {datetime:at(-dow-1,10), online:true, status:'confirmed'},       // Sunday BEFORE this week
  {datetime:at(6-dow,10), online:true, status:'confirmed'},        // Sunday of this week
  {datetime:'rubbish', online:true, status:'confirmed'},           // unparseable: skipped
];
const t=api.tally();
is(t.today, 2, "today counts today's online bookings only");
is(t.todayAll, 3, 'and today’s total ignores the cancelled one');
is(t.week, 4, 'the week runs Monday to Sunday and takes in both ends');
is(t.week > t.today, true, 'the week is the wider number');
ctx.appointments=[];
is(api.tally(), {today:0,week:0,todayAll:0,weekAll:0}, 'an empty diary gives zeros, not an error');
ctx.appointments=null;
is(api.tally().today, 0, 'a missing diary gives zeros too');

console.log(fail? '\n'+fail+' FAILED' : '\nall online-marker checks passed');
process.exit(fail?1:0);
