// ═══════════════════════════════════════════════════════════════════════════
// The answer-asking reminder switches itself on (WA_CONFIRM, randevu_onay2).
//
//   1. not approved yet → both reminders go out under the old templates
//   2. approved (listed by Piyzi) → the 90-minute reminder goes out under
//      randevu_onay2, with the Turkish long date and the hour, and no Detaylar
//      button value; the day-before one stays the plain old reminder
//   3. Piyzi refuses the new one → the old one is sent instead
//   4. the approval answer is cached, so Piyzi is asked once, not per send
//   5. wrangler.toml names randevu_onay2 with [dateLong, time]
//
// Run:  node tests/wa-confirm-switch.test.js
// ═══════════════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');
const { pathToFileURL } = require('url');

let pass = 0, fail = 0;
const is = (got, want, label) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else fail++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (ok ? '' : '\n      got  ' + JSON.stringify(got) + '\n      want ' + JSON.stringify(want)));
};

const R24 = '{"templateName":"pyz_randevu_hatirlatma_24saat","languageCode":"tr","body":["{time}"],"buttons":{"0":"{apptId}"}}';
const R1 = '{"templateName":"pyz_randevu_hatirlatma_2saat","languageCode":"tr","body":["{time}"],"buttons":{"0":"{apptId}"}}';
const CONF = '{"templateName":"randevu_onay4","namePrefix":"randevu_onay","languageCode":"tr","body":["{dateLong}","{time}"]}';

function kv() { const m = new Map(); return { m, get: async k => (m.has(k) ? m.get(k) : null), put: async (k, v) => { m.set(k, v); } }; }

(async () => {
  const w = await import(pathToFileURL(path.join(__dirname, '..', 'worker', 'src', 'index.js')).href);
  const worker = w.default;
  const ctx = { waitUntil() {} };

  // A day far enough ahead that both reminders are due, at 14:00.
  const d = new Date(Date.now() + 5 * 86400e3);
  const dateISO = d.toISOString().slice(0, 10);

  function setup({ approved, refuseNew, open, approvedName }) {
    const sent = [], listCalls = [];
    globalThis.fetch = async (u, o = {}) => {
      u = String(u);
      if (u.includes('firebaseio')) return new Response('{}');
      if (u.endsWith('/whatsapp/templates')) {
        listCalls.push(u);
        const templates = [{ name: 'pyz_randevu_hatirlatma_24saat', language: 'tr' }, { name: 'pyz_randevu_hatirlatma_2saat', language: 'tr' }];
        if (approved) for (const n of [].concat(approvedName || 'randevu_onay2')) templates.push({ name: n, language: 'tr' });
        return new Response(JSON.stringify({ success: true, data: { templates } }));
      }
      if (u.endsWith('/whatsapp/messages')) {
        const b = JSON.parse(o.body);
        sent.push(b);
        if (refuseNew && b.templateName.startsWith('randevu_onay')) {
          return new Response(JSON.stringify({ success: false, error: { code: 'TEMPLATE_PARAMS_MISMATCH', message: 'x' } }), { status: 400 });
        }
        return new Response(JSON.stringify({ success: true, data: { scheduledMessage: { uid: 'u' + sent.length } } }));
      }
      return new Response('{}', { status: 404 });
    };
    const env = { WA_KEY: 'k', PIYZI_API_KEY: 'p', WA_R24: R24, WA_R1: R1, WA_CONFIRM: CONF, WA_CONFIRM_MIN: '90', WA_OPEN: open || '23:59', RD_WA: kv() };
    const send = () => worker.fetch(new Request('https://w.dev/wa/schedule', {
      method: 'POST', headers: { 'x-rd-key': 'k', 'content-type': 'application/json' },
      body: JSON.stringify({ apptId: 'a1', phone: '05338669933', name: 'Ayşe', dateISO, timeHHMM: '14:00', service: 'Manikür' }),
    }), env, ctx);
    return { sent, listCalls, env, send };
  }

  console.log('1. not approved yet');
  {
    const s = setup({ approved: false });
    const r = await (await s.send()).json();
    is(r.ok, true, 'scheduled');
    is(s.sent.map(b => b.templateName).sort(), ['pyz_randevu_hatirlatma_24saat', 'pyz_randevu_hatirlatma_2saat'], 'old templates, as before');
  }

  console.log('2. approved');
  {
    const s = setup({ approved: true });
    const r = await (await s.send()).json();
    is(r.ok, true, 'scheduled');
    is(s.sent.map(b => b.templateName), ['pyz_randevu_hatirlatma_24saat', 'randevu_onay2'], 'day before stays plain; the near one asks with buttons');
    is(s.sent[1].parameters.body[1], '14:00', 'second variable is the hour');
    is(/^\d{1,2} \S+ \S+$/.test(s.sent[1].parameters.body[0]), true, 'first variable is the long date: ' + s.sent[1].parameters.body[0]);
    is(s.sent[1].parameters.buttons, undefined, 'no button value (quick replies have none)');
    const at = s.sent.map(b => b.scheduledAt).sort();
    const appt = new Date(at[1]).getTime() + 90 * 60e3;
    is(new Date(at[0]).getTime(), appt - 24 * 3600e3, '24 hours before');
    is(new Date(at[1]).getTime(), appt - 90 * 60e3, 'and 90 minutes before (WA_CONFIRM_MIN)');
  }

  console.log('2b. approved: a mid-day booking also gets the near reminder');
  {
    const s = setup({ approved: true, open: '08:00' });
    await s.send();
    is(s.sent.length, 2, 'both reminders, though 14:00 is covered by the call before approval');
  }

  console.log('2c. not approved: a mid-day booking keeps the old rule');
  {
    const s = setup({ approved: false, open: '08:00' });
    await s.send();
    is(s.sent.map(b => b.templateName), ['pyz_randevu_hatirlatma_24saat'], 'only the 24-hour reminder');
  }

  console.log('2d. a resubmission under a new name counts too');
  {
    const s = setup({ approved: true, approvedName: 'randevu_onay3' });
    await s.send();
    is(s.sent.map(b => b.templateName), ['pyz_randevu_hatirlatma_24saat', 'randevu_onay3'], 'randevu_onay3 is picked up with no config edit');
  }

  console.log('2e. the ✅/❌ version (randevu_onay4) wins once approved');
  {
    const s = setup({ approved: true, approvedName: ['randevu_onay', 'randevu_onay2', 'randevu_onay4'] });
    await s.send();
    is(s.sent.map(b => b.templateName), ['pyz_randevu_hatirlatma_24saat', 'randevu_onay4'], 'randevu_onay4 preferred over randevu_onay2');
  }

  console.log('3. Piyzi refuses the new template');
  {
    const s = setup({ approved: true, refuseNew: true });
    const r = await (await s.send()).json();
    is(r.ok, true, 'still scheduled');
    is(s.sent.map(b => b.templateName), ['pyz_randevu_hatirlatma_24saat', 'randevu_onay2', 'pyz_randevu_hatirlatma_2saat'], 'the refusal falls back to the old reminder');
  }

  console.log('4. cached');
  {
    const s = setup({ approved: false });
    await s.send(); await s.send(); await s.send();
    is(s.listCalls.length, 1, 'Piyzi asked once for three bookings');
    is(s.env.RD_WA.m.get('tpl:live3:randevu_onay4|randevu_onay|/tr'), '-', 'cached as not yet approved');
  }

  console.log('5. wrangler.toml');
  {
    const toml = fs.readFileSync(path.join(__dirname, '..', 'worker', 'wrangler.toml'), 'utf8');
    const m = toml.match(/^WA_CONFIRM = '(.*)'$/m);
    is(m && JSON.parse(m[1]), JSON.parse(CONF), 'WA_CONFIRM: randevu_onay4, any randevu_onay* approved, [dateLong, time]');
    is(/^WA_CONFIRM_MIN = "90"$/m.test(toml), true, 'WA_CONFIRM_MIN is 90');
    is(/^WA_R24 = '.*pyz_randevu_hatirlatma_24saat/m.test(toml), true, 'old WA_R24 left in place as the fallback');
  }

  console.log(`\n${pass} passed, ${fail} failed`);
  process.exit(fail ? 1 : 0);
})();
