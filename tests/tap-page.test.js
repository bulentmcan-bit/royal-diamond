// ═══════════════════════════════════════════════════════════════════════════
// tap.html — the page the girls press, run in a REAL browser.
//
// This test exists because of a bug that reached the live page on 18 Eylül
// 2026 and would have cost money. The worker sends no CORS headers, so the
// phone is not allowed to READ its reply. The first version treated that as
// a failure and told her "İnternet yok — tekrar bas" while the crown had in
// fact landed perfectly. She taps again, the board starts a second job, and
// the commission figures are wrong for the rest of the day.
//
// So the page no longer asks the worker whether it worked. It subscribes to
// the press queue FIRST, notes what is already in it, fires the request with
// mode 'no-cors', and waits to SEE a new press with her name and her gesture
// appear. Everything below pins that behaviour.
//
// The five cases, and why each one is here:
//   1. the ordinary press — it lands, she is told it landed
//   2. another girl's press is already queued — it must not be mistaken
//      for hers, and hers must still confirm when it arrives
//   3. someone else presses but hers never appears — the page must NOT
//      claim a crown it has not seen; it says "look at the screen"
//   4. the phone is off the network — the one case that is a real failure
//   5. EventSource missing or blocked — the press must still go out, and
//      the message must stay honest about not having confirmed it
//
// Every case also pins the two things that cause double jobs: exactly ONE
// request per tap, and the buttons unlocked again afterwards.
//
//   node tests/tap-page.test.js
//
// Needs playwright and a chromium. If neither is here (a plain checkout, or
// CI without browsers) the test says so and passes rather than failing on a
// missing dependency.
// ═══════════════════════════════════════════════════════════════════════════

'use strict';

const fs   = require('fs');
const path = require('path');

const PAGE = path.join(__dirname, '..', 'tap.html');

const CHROMIUM = [
  '/opt/pw-browsers/chromium-1194/chrome-linux/chrome',
  '/opt/pw-browsers/chromium/chrome-linux/chrome',
].find(p => { try { return fs.existsSync(p); } catch (e) { return false; } });

let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { chromium = null; }

if (!chromium) {
  console.log('— playwright is not installed here; nothing to run. Skipping.');
  process.exit(0);
}

// ───────────────────────────────────────────────────────────────────────────

const CASES = [
  {
    name: 'her press lands and she is told so',
    net: 'ok',
    puts: [
      { at: 60,  data: '{"path":"/","data":null}' },
      { at: 360, data: '{"path":"/abc-123","data":{"g":"single","src":"shelly","ts":1,"who":"lissa"}}' },
    ],
    want: { cls: 'ok on', txt: 'Onaylandı 👑' },
  },
  {
    name: "another girl's press was already queued — hers still confirms",
    net: 'ok',
    puts: [
      { at: 60,  data: '{"path":"/","data":{"old-1":{"g":"double","src":"shelly","ts":1,"who":"helen"}}}' },
      { at: 360, data: '{"path":"/new-9","data":{"g":"single","src":"shelly","ts":2,"who":"lissa"}}' },
    ],
    want: { cls: 'ok on', txt: 'Onaylandı 👑' },
  },
  {
    name: "somebody else's press arrives, hers does not — no crown is claimed",
    net: 'ok',
    puts: [
      { at: 60,  data: '{"path":"/","data":null}' },
      { at: 360, data: '{"path":"/other","data":{"g":"single","src":"shelly","ts":1,"who":"hannah"}}' },
    ],
    want: { cls: 'ok on', txt: 'Gönderildi — ekrana bak' },
    slow: true,
  },
  {
    name: 'the phone is off the network — the one real failure',
    net: 'fail',
    puts: [{ at: 60, data: '{"path":"/","data":null}' }],
    want: { cls: 'bad on', txt: 'İnternet yok — tekrar bas' },
  },
  {
    name: 'EventSource blocked — the press still goes, the message stays honest',
    net: 'ok',
    noES: true,
    puts: [],
    want: { cls: 'ok on', txt: 'Gönderildi — ekrana bak' },
    slow: true,
  },
];

(async () => {
  const browser = await chromium.launch(CHROMIUM ? { executablePath: CHROMIUM } : {});
  let pass = 0, fail = 0;

  const is = (got, want, what) => {
    if (JSON.stringify(got) === JSON.stringify(want)) { pass++; }
    else { fail++; console.log(`  ✗ ${what}\n      wanted ${JSON.stringify(want)}\n      got    ${JSON.stringify(got)}`); }
  };

  for (const c of CASES) {
    console.log(c.name);
    const ctx  = await browser.newContext();
    const page = await ctx.newPage();

    // No network at all: fetch is recorded, EventSource is a scripted stub.
    await page.addInitScript(({ net, puts, noES }) => {
      window.__fetched = [];
      window.fetch = (u, o) => {
        window.__fetched.push({ u: String(u), mode: o && o.mode });
        return net === 'ok' ? Promise.resolve({ ok: true })
                            : Promise.reject(new TypeError('Failed to fetch'));
      };
      if (noES) { window.EventSource = undefined; return; }
      window.EventSource = function (url) {
        this.url = url; this._l = {};
        const self = this;
        (puts || []).forEach(p => setTimeout(() => self._emit('put', p.data), p.at));
      };
      window.EventSource.prototype.addEventListener = function (t, fn) {
        (this._l[t] = this._l[t] || []).push(fn);
      };
      window.EventSource.prototype._emit = function (t, data) {
        (this._l[t] || []).forEach(fn => fn({ data }));
      };
      window.EventSource.prototype.close = function () { this._closed = true; };
    }, c);

    await page.goto('file://' + PAGE + '?who=lissa');
    await page.waitForSelector('button.act');
    await page.locator('button.act').first().click();      // Manikür başlat
    await page.waitForTimeout(c.slow ? 8200 : 2200);

    const got = await page.evaluate(() => ({
      cls:      document.getElementById('toast').className,
      txt:      document.getElementById('toast').textContent,
      calls:    window.__fetched.length,
      mode:     window.__fetched[0] && window.__fetched[0].mode,
      url:      window.__fetched[0] && window.__fetched[0].u,
      relocked: [...document.querySelectorAll('button.act')].every(b => !b.disabled),
    }));

    is({ cls: got.cls, txt: got.txt }, c.want, 'what she is told');
    is(got.calls, 1, 'exactly one request per tap — two would start two jobs');
    is(got.mode, 'no-cors', "the request is sent no-cors, since the reply cannot be read anyway");
    is(/who=lissa/.test(got.url || '') && /g=single/.test(got.url || ''), true, 'her name and her gesture are on it');
    is(got.relocked, true, 'the buttons unlock again afterwards');
  }

  await browser.close();
  console.log('');
  console.log(fail ? `✗ ${fail} FAILED, ${pass} passed` : `✓ all ${pass} passed`);
  process.exit(fail ? 1 : 0);
})().catch(e => { console.error('✗ test crashed:', e); process.exit(1); });
