// ═══════════════════════════════════════════════════════════════════════════
// The extra minutes a design earns.
//
// A manicure is 60 minutes. Some manicures are longer because the customer
// asked for a design, and some lash sets are longer because they are volume
// rather than classic. The phone says so when the job is started, and those
// minutes are hers only because the work is really there.
//
// What must hold:
//   1. a wall press is written EXACTLY as it always was -- no length, no
//      add-on, her ordinary limit. This is the one that must never break:
//      three Shelly buttons in the salon send nothing else.
//   2. a phone press carries a length off the short list, and an add-on
//   3. a length that is NOT on the list is dropped and the press still lands
//      on her ordinary limit -- she has done the work either way
//   4. an add-on asked for on the wrong kind of work is ignored
//   5. the wall tile says what the extra minutes were given for
//   6. the relay's copy of the two lists still matches crown-config.js --
//      the relay cannot read that file, so the lists are written twice and
//      this is what stops them drifting apart
//
//   node tests/design-addon.test.js
//
// Needs playwright and a chromium for 1-5; 6 runs anywhere. Firebase is a
// stub, so this never reads or writes the salon's live data.
// ═══════════════════════════════════════════════════════════════════════════
'use strict';

const fs   = require('fs');
const path = require('path');

const ROOT = path.join(__dirname, '..');
const PAGE = path.join(ROOT, 'timers.html');

let pass = 0, fail = 0;
const is = (got, want, what) => {
  if (JSON.stringify(got) === JSON.stringify(want)) { pass++; }
  else { fail++; console.log(`  ✗ ${what}\n      wanted ${JSON.stringify(want)}\n      got    ${JSON.stringify(got)}`); }
};

// ── 6. the two lists, written in two files, must still agree ────────────────
console.log('6. the relay and the config still agree');
{
  require(path.join(ROOT, 'crown-config.js'));
  const C = globalThis.CROWN;
  const w = fs.readFileSync(path.join(ROOT, 'worker', 'src', 'index.js'), 'utf8');

  const lim = (w.match(/const PRESS_LIMITS = \[([^\]]*)\]/) || [])[1];
  const dsn = (w.match(/const DESIGNS = \[([^\]]*)\]/) || [])[1];
  is(lim ? lim.split(',').map(s => Number(s.trim())) : null, C.pressLimits,
     'worker PRESS_LIMITS matches crown-config pressLimits');
  is(dsn ? dsn.split(',').map(s => s.trim().replace(/['"]/g, '')) : null, Object.keys(C.designs),
     'worker DESIGNS matches crown-config designs');

  // the press body must leave both keys out entirely when there is nothing to
  // say, or a wall press stops looking like a wall press
  is(/\.\.\.\(limOk !== null \? \{ lim: limOk \} : \{\}\)/.test(w), true,
     'relay omits lim when there is none');
  is(/\.\.\.\(dOk\s+!== null \? \{ d: dOk \}\s+: \{\}\)/.test(w), true,
     'relay omits d when there is none');

  // and the validators themselves
  is([C.pressLimit(45), C.pressLimit(60), C.pressLimit(75), C.pressLimit(90), C.pressLimit(105)],
     [45, 60, 75, 90, 105], 'every offered length is accepted');
  is([C.pressLimit(61), C.pressLimit(0), C.pressLimit(-60), C.pressLimit('abc'), C.pressLimit(null)],
     [null, null, null, null, null], 'anything else is refused');
  is(C.designFor('b', 'manicure').addMin, 30, 'Desen B is +30 on a manicure');
  is(C.designFor('a', 'manicure').addMin, 15, 'Desen A is +15 on a manicure');
  is(C.designFor('vol', 'lash').addMin, 15, 'Volume is +15 on lashes');
  is(C.designFor('b', 'pedicure'), null, 'a design is refused on a pedicure');
  is(C.designFor('vol', 'manicure'), null, 'volume is refused on a manicure');
  is(C.designFor('nonsense', 'manicure'), null, 'an unknown add-on is refused');
  is(C.designFor(null, 'manicure'), null, 'no add-on is no add-on');
}

// ── 7. the phone's own copy of the numbers must match the config ───────────
console.log("7. the phone page agrees with the config");
{
  require(path.join(ROOT, 'crown-config.js'));
  const C = globalThis.CROWN;
  const tap = fs.readFileSync(path.join(ROOT, 'tap.html'), 'utf8');

  // pull the button table straight out of the page
  const rows = [...tap.matchAll(/\{g:"(\w+)",[^}]*?tr:"([^"]+)"[^}]*?\}/g)].map(m => {
    const line = m[0];
    const num = k => { const r = new RegExp(k + ':(\\d+)').exec(line); return r ? Number(r[1]) : null; };
    const str = k => { const r = new RegExp(k + ':"([^"]+)"').exec(line); return r ? r[1] : null; };
    return { g: m[1], tr: m[2], lim: num('lim'), add: num('add'), d: str('d') };
  });

  is(rows.length, 7, 'seven buttons on the phone');
  is(rows.map(r => r.lim), [60, 75, 90, 45, 75, 90, null], 'the lengths, in order down the screen');
  is(rows.map(r => r.d),   [null, 'a', 'b', null, null, 'vol', null], 'and which add-on each one carries');

  // every length the phone can send must be one the relay will accept
  rows.filter(r => r.lim).forEach(r =>
    is(C.pressLimit(r.lim), r.lim, `the relay accepts ${r.lim} min (${r.tr})`));

  // every add-on must exist, belong on that kind of work, and the minutes it
  // prints must be the minutes it actually adds
  const TYPE = { single:'manicure', double:'pedicure', triple:'lash' };
  rows.filter(r => r.d).forEach(r => {
    const dsn = C.designFor(r.d, TYPE[r.g]);
    is(!!dsn, true, `${r.tr}: the add-on belongs on a ${TYPE[r.g]}`);
    if (dsn) {
      is(dsn.addMin, r.add, `${r.tr}: printed +${r.add} matches the config`);
      const base = rows.find(x => x.g === r.g && !x.d).lim;
      is(base + dsn.addMin, r.lim, `${r.tr}: ${base} + ${dsn.addMin} really is ${r.lim}`);
    }
  });

  // the finish button must never carry a length -- it ends a job, it does not
  // start one
  is(rows.find(r => r.g === 'long').lim, null, 'the finish button sends no length');

  // and the press must only carry them when there is something to say, or a
  // wall press stops looking like a wall press
  is(/\(a\.lim \? "&lim=" \+ encodeURIComponent\(a\.lim\) : ""\)/.test(tap), true,
     'the phone omits lim when the button has none');
  is(/\(a\.d\s+\? "&d="\s+\+ encodeURIComponent\(a\.d\)\s+: ""\)/.test(tap), true,
     'the phone omits d when the button has none');
  // the confirmation has to tell the right press from the others
  // A press naming a DIFFERENT length is not hers -- three buttons share a
  // gesture. A press naming NO length still is: that is what the wall buttons
  // send, and being strict there would leave her watching "Gönderiliyor..."
  // for a crown that had already landed.
  is(/if \(rec\.lim == null\) return true;/.test(tap), true,
     'a press with no length still confirms — the wall buttons send none');
  is(/Number\(rec\.lim\) === Number\(a\.lim \|\| 0\)/.test(tap), true,
     'but a press naming a different length is somebody else\'s');
}

const CHROMIUM = [
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium/chrome-linux/chrome',
].find(p => { try { return fs.existsSync(p); } catch (e) { return false; } });

let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { chromium = null; }
if (!chromium) {
  console.log('— playwright is not installed here; 1-5 skipped.');
  console.log(`\n${fail ? '✗' : '✓'} ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
}

(async () => {
  const browser = await chromium.launch(CHROMIUM ? { executablePath: CHROMIUM } : {});
  const ctx  = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  await page.route('**/firebasejs/**', r => r.fulfill({ status:200, contentType:'application/javascript', body:'' }));

  await page.addInitScript(() => {
    window.__writes = [];
    const snap = v => ({ val: () => v });
    const OPS = { lissa: { name:'Lissa' }, hannah: { name:'Hannah' }, helen: { name:'Helen' } };
    window.firebase = { initializeApp(){}, database(){ return { ref(p){ return {
      on(ev, cb){ if (ev !== 'value') return;
        const fire = v => setTimeout(() => cb(snap(v)), 0);
        if (p === '.info/serverTimeOffset') return fire(0);
        if (p === 'timers/ops')             return fire(OPS);
        if (p === 'timers/limits')          return fire({});
        return fire(null); },
      update(u){ window.__writes.push(u); return Promise.resolve(); },
      remove(){ return Promise.resolve(); },
      transaction(){ return Promise.resolve(); }, push(){ return { key:'x' }; }
    }; } }; } };
  });
  await page.goto('file://' + PAGE);
  await page.waitForTimeout(1200);

  // fire a press and read back the job that was written for her
  const press = (gesture, lim, d) => page.evaluate(([g, l, dd]) => {
    window.__writes = [];
    window.CrownBoard.onButton('Lissa', g, l, dd);
    const w = window.__writes.find(x => x['ops/lissa/current']);
    const j = w ? w['ops/lissa/current'] : null;
    return j ? { type:j.type, limitMin:j.limitMin, design:j.design ?? null,
                 limitOvr: j.limitOvr ?? null, keys:Object.keys(j).sort() } : null;
  }, [gesture, lim, d]);

  console.log('1. a wall press is untouched');
  is(await press('single'), { type:'manicure', limitMin:60, design:null, limitOvr:null,
                              keys:['limitMin','startAt','type'] },
     'single press: manicure, her ordinary 60, and nothing else written');
  is((await press('double')).limitMin, 60, 'double press: pedicure on her ordinary limit');
  is((await press('triple')).type, 'lash', 'triple press: lashes');

  console.log('2. a phone press carries the length and the add-on');
  is(await press('single', 90, 'b'),
     { type:'manicure', limitMin:90, design:'b', limitOvr:true,
       keys:['design','limitMin','limitOvr','startAt','type'] },
     'manicure + Desen B runs 90 minutes and says so');
  is((await press('single', 75, 'a')).limitMin, 75, 'manicure + Desen A runs 75');
  is((await press('double', 45)).limitMin,      45, 'a pedicure runs 45');
  is((await press('triple', 90, 'vol')).design, 'vol', 'volume lashes are recorded as volume');
  is((await press('triple', 90, 'vol')).limitMin, 90, 'volume lashes run 90');
  is((await press('triple', 75)).limitMin, 75, 'classic lashes run 75');

  console.log('3. a length off the list is dropped, the press still lands');
  is((await press('single', 61, 'b')).limitMin, 60, '61 minutes is refused and she keeps her 60');
  is((await press('single', 61, 'b')).type, 'manicure', 'and the job still starts');
  is((await press('single', 600)).limitMin, 60, 'a length management could set, a phone cannot');

  console.log('4. an add-on on the wrong work is ignored');
  is((await press('double', 45, 'b')).design, null, 'no Desen B on a pedicure');
  is((await press('single', 90, 'vol')).design, null, 'no Volume on a manicure');
  is((await press('single', 90, '../../etc')).design, null, 'and nothing odd gets through');

  console.log('5. the wall says what the minutes were for');
  // Painted from the data the way a real board gets it -- a job already
  // running, read off timers/ops -- rather than by poking the page.
  const label = async scene => {
    const c2 = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
    const p2 = await c2.newPage();
    await p2.route('**/firebasejs/**', r => r.fulfill({ status:200, contentType:'application/javascript', body:'' }));
    await p2.addInitScript(sc => {
      const now = Date.now();
      const OPS = JSON.parse(JSON.stringify(sc));
      for (const k in OPS) if (OPS[k].current) OPS[k].current.startAt = now - 10*60000;
      const snap = v => ({ val: () => v });
      window.firebase = { initializeApp(){}, database(){ return { ref(pp){ return {
        on(ev, cb){ if (ev !== 'value') return;
          const fire = v => setTimeout(() => cb(snap(v)), 0);
          if (pp === '.info/serverTimeOffset') return fire(0);
          if (pp === 'timers/ops')             return fire(OPS);
          if (pp === 'timers/limits')          return fire({});
          return fire(null); },
        update(){ return Promise.resolve(); }, remove(){ return Promise.resolve(); },
        transaction(){ return Promise.resolve(); }, push(){ return { key:'x' }; }
      }; } }; } };
    }, scene);
    await p2.goto('file://' + PAGE);
    await p2.waitForTimeout(1200);
    const txt = await p2.evaluate(() => {
      const t = [...document.querySelectorAll('.tile')]
        .find(x => (x.querySelector('.t-name')||{}).textContent === 'Lissa');
      return t ? (t.querySelector('.t-job')||{}).textContent : null;
    });
    await c2.close();
    return txt;
  };
  const L = j => ({ lissa: { name:'Lissa', current: j } });

  is(await label(L({ type:'manicure', limitMin:90, design:'b',   limitOvr:true })),
     '💅 Manicure + Desen B', 'the tile names the design');
  is(await label(L({ type:'lash',     limitMin:90, design:'vol', limitOvr:true })),
     '👁 Eyelashes + Volume', 'and names a volume set');
  is(await label(L({ type:'manicure', limitMin:60 })),
     '💅 Manicure', 'a plain job reads exactly as before');
  is(await label(L({ type:'pedicure', limitMin:45, design:'b' })),
     '🦶 Pedicure', 'a design filed against the wrong work is not shown');

  await browser.close();
  console.log(`\n${fail ? '✗' : '✓'} ${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error(e); process.exit(1); });
