// ═══════════════════════════════════════════════════════════════════════════
// The wall board follows the PERSON, not the room.
//
// It used to be two screens, one per kind of work, each near its own chairs.
// That arrangement could not show eyelashes at all. A lash job matched
// neither screen, so paint() fell through to the "she is busy on the other
// screen" tile: greyed out, no bar, no fifteen-minute chime, no over-time
// alarm, and when she finished, no crown on either wall. Hannah had a crowned
// eyelash job sitting in the data that no screen had ever shown.
//
// ?area=all (and no area at all, which is now the default) paints every
// technician and whatever she is actually on. The old room boards still work
// for a bookmark -- ?area=manicure / pedicure / lash -- and are pinned below
// too, so the change did not quietly break them.
//
//   node tests/board-everyone.test.js
//
// Needs playwright and a chromium; skips cleanly without them. Firebase is a
// stub, so this never reads or writes the salon's live data.
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

const fs   = require('fs');
const path = require('path');

const PAGE = path.join(__dirname, '..', 'timers.html');

const CHROMIUM = [
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium/chrome-linux/chrome',
].find(p => { try { return fs.existsSync(p); } catch (e) { return false; } });

let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { chromium = null; }
if (!chromium) { console.log('— playwright is not installed here; nothing to run. Skipping.'); process.exit(0); }

// Helen on a manicure with half her hour left; Lissa on EYELASHES with eight
// minutes to go, which must be amber; Hannah free, her last job a lash job she
// ran twenty minutes over, which must show the sad face.
const SCENE = {
  helen:  { name: 'Helen',  current: { type: 'manicure', startAt: -28, limitMin: 60 } },
  lissa:  { name: 'Lissa',  current: { type: 'lash',     startAt: -52, limitMin: 60 } },
  hannah: { name: 'Hannah', last: {
    manicure: { type:'manicure', startAt:-200, endAt:-150, elapsed: 50, limitMin: 60, crown: true  },
    lash:     { type:'lash',     startAt:-90,  endAt:-20,  elapsed: 70, limitMin: 60, crown: false }
  } }
};

let pass = 0, fail = 0;
const is = (got, want, what) => {
  if (JSON.stringify(got) === JSON.stringify(want)) pass++;
  else { fail++; console.log(`  ✗ ${what}\n      wanted ${JSON.stringify(want)}\n      got    ${JSON.stringify(got)}`); }
};

async function open(browser, area){
  const ctx  = await browser.newContext({ viewport: { width: 1920, height: 1080 } });
  const page = await ctx.newPage();
  await page.route('**/firebasejs/**', r => r.fulfill({ status:200, contentType:'application/javascript', body:'' }));
  await page.addInitScript(scene => {
    const M = 60000, now = Date.now();
    const mins = o => { const c = JSON.parse(JSON.stringify(o));
      for (const k in c) {
        if (c[k].current) { c[k].current.startAt = now + c[k].current.startAt * M; }
        for (const t in (c[k].last || {})) {
          const j = c[k].last[t];
          j.startAt = now + j.startAt * M; j.endAt = now + j.endAt * M; j.elapsed = j.elapsed * M;
        }
      } return c; };
    const OPS = mins(scene);
    const snap = v => ({ val: () => v });
    window.firebase = { initializeApp(){}, database(){ return { ref(p){ return {
      // Real Firebase answers asynchronously and the page relies on it:
      // buildBoard() runs after these subscriptions are made, so a synchronous
      // stub would paint before the tiles exist.
      on(ev, cb){ if (ev !== 'value') return;
        const fire = v => setTimeout(() => cb(snap(v)), 0);
        if (p === '.info/serverTimeOffset') return fire(0);
        if (p === 'timers/ops')             return fire(OPS);
        if (p === 'timers/limits')          return fire({});
        return fire(null); },
      update(){ return Promise.resolve(); }, remove(){ return Promise.resolve(); },
      transaction(){ return Promise.resolve(); }, push(){ return { key:'x' }; }
    }; } }; } };
  }, SCENE);
  await page.goto('file://' + PAGE + (area ? '?area=' + area : ''));
  await page.waitForTimeout(1200);
  return { ctx, page };
}

const read = page => page.evaluate(() => ({
  title:  document.getElementById('areaTitle').textContent,
  stat:   document.getElementById('headStat').textContent,
  switchHidden: document.getElementById('otherAreaBtn').classList.contains('hidden'),
  picker: !document.getElementById('pickPage').classList.contains('hidden'),
  tiles: [...document.querySelectorAll('.tile')].map(t => ({
    name: (t.querySelector('.t-name')||{}).textContent,
    job:  (t.querySelector('.t-job') ||{}).textContent,
    time: (t.querySelector('.t-time')||{}).textContent,
    mark: t.querySelector('.t-mark') && !t.querySelector('.t-mark').classList.contains('hidden')
            ? t.querySelector('.t-mark').textContent : '',
    state: t.className.replace('tile','').trim()
  }))
}));

(async () => {
  const browser = await chromium.launch(CHROMIUM ? { executablePath: CHROMIUM } : {});

  console.log('1. the everyone board');
  {
    const { ctx, page } = await open(browser, 'all');
    const g = await read(page);
    is(g.title, 'Crown Board', 'it is called the Crown Board, not a kind of work');
    is(g.picker, false, 'no "which screen is this?" question');
    is(g.switchHidden, true, 'no switch button — there is no other screen now');
    is(g.tiles.length, 3, 'Helen, Lissa and Hannah');
    is(g.tiles[0].job, '💅 Manicure', 'Helen is on a manicure');
    is(g.tiles[0].state, 'run', 'with half her hour left, she is green');
    is(g.tiles[1].job, '👁 Eyelashes', 'LISSA IS ON EYELASHES — the job the old board could not show');
    is(g.tiles[1].state, 'warn', 'eight minutes left, so eyelashes go amber like any other job');
    is(g.tiles[2].job, '👁 Eyelashes', "Hannah's tile remembers her LAST job, and that was lashes");
    is(g.tiles[2].time, '70 / 60 min', 'seventy minutes against her hour');
    is(g.tiles[2].mark, '😢', 'and the verdict is on the wall — it never used to be');
    is(g.stat.replace(/\s+/g,' ').trim(), '2 running · 0 over · 0 👑', 'the header counts the lash job as running');
    await ctx.close();
  }

  console.log('2. no area at all is the same board');
  {
    const { ctx, page } = await open(browser, '');
    const g = await read(page);
    is(g.picker, false, 'a screen that opens with no address still lands on the board');
    is(g.title, 'Crown Board', 'and it is the everyone board');
    is(g.tiles[1].job, '👁 Eyelashes', 'Lissa still shows her lash countdown');
    await ctx.close();
  }

  console.log('3. the old room boards still work for a bookmark');
  {
    const { ctx, page } = await open(browser, 'manicure');
    const g = await read(page);
    is(g.title, 'Manicure', 'the manicure board still says Manicure');
    is(g.switchHidden, false, 'and still offers the switch to the other one');
    is(g.tiles[0].state, 'run', 'Helen, on a manicure, is this screen’s job');
    is(g.tiles[1].state, 'elsewhere', 'Lissa, on lashes, is greyed — which is exactly the old problem');
    await ctx.close();
  }
  {
    const { ctx, page } = await open(browser, 'lash');
    const g = await read(page);
    is(g.title, 'Eyelashes', 'the hidden eyelash board is still reachable');
    is(g.tiles[1].state, 'warn', 'and Lissa counts down on it');
    await ctx.close();
  }

  await browser.close();
  console.log('');
  console.log(fail ? `✗ ${fail} FAILED, ${pass} passed` : `✓ all ${pass} passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('✗ test crashed:', e); process.exit(1); });
