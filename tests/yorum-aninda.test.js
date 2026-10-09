// ═══════════════════════════════════════════════════════════════════════════
// ⭐ Yorum isteği — 😊 Memnun'a basıldığı an.
//
// 9 Ekim 2026. Bülent: "Her müşteri tamamlandığında, Memnun'a basılırsa,
// mesaj otomatik gitsin. Memnun Değil'e basılırsa gitmesin."
//
// Eskiden istek akşam 19:00'da toplu gidiyordu ve geçen beş akşamın
// ortalaması şuydu:
//
//     bakılan ziyaret        48
//     gönderilen              3
//     "son 180 günde zaten istendi"   16–25
//     "memnuniyet kaydı yok"           9–18
//
// Yani çalışıyordu — ama yirmi memnun müşteriden üçüne ulaşıyordu. İki
// sebep vardı: 180 günlük bekleme (ayda bir gelen müşteri bahara kadar
// kilitli) ve çıkışta memnuniyet sorusunun üçte bir oranında hiç
// cevaplanmaması.
//
// Artık \U0001F60A butonu anahtarın kendisi. Karar worker'da (reviewNow), çünkü
// bekleme süresini, STOP listesini ve günlük sınırı akşamki çalıştırmayla
// AYNI kayıttan okumak zorunda — yoksa aynı kadına iki kere sorulur.
//
// Çalıştırma:  node tests/yorum-aninda.test.js
// ═══════════════════════════════════════════════════════════════════════════
'use strict';
const fs = require('fs');
const path = require('path');

let pass = 0, fail = 0;
const is = (got, want, label) => {
  const ok = JSON.stringify(got) === JSON.stringify(want);
  if (ok) pass++; else fail++;
  console.log((ok ? '  ✓ ' : '  ✗ ') + label + (ok ? '' : '\n      got  ' + JSON.stringify(got) + '\n      want ' + JSON.stringify(want)));
};
const R = (f) => fs.readFileSync(path.join(__dirname, '..', f), 'utf8');
const html = R('index.html');
const worker = R('worker/src/index.js');
const config = R('crown-config.js');

console.log('1. 😊 Memnun is the switch — and only 😊');
{
  const satPick = html.slice(html.indexOf('function satPick('), html.indexOf('function satPick(') + 900);
  is(/if\(val==='happy'\)\{ try\{ rdReviewNow\(a\); \}catch\(e\)\{\} \}/.test(satPick), true,
     "satPick fires the review request for 'happy'");
  is(/a\.sat=val/.test(satPick), true, '…after the answer is recorded on the visit');
  // The whole reason the feature is gated: an unhappy customer must never be
  // invited to rate the salon in public. Judged on the CODE, not the prose —
  // the comments beside it necessarily say the word "unhappy".
  const code = satPick.split('\n').filter(l => !l.trim().startsWith('//')).join('\n');
  is((code.match(/rdReviewNow\(/g) || []).length, 1, 'exactly one send call in satPick');
  is(/if\(val==='happy'\)\{ try\{ rdReviewNow\(a\); \}catch\(e\)\{\} \}/.test(code), true,
     '…and it sits inside the happy branch, nowhere else');
  is(/unhappy/.test(code), false, "no code path in satPick mentions 'unhappy' at all");
  const fn = html.slice(html.indexOf('function rdReviewNow('), html.indexOf('function rdReviewNow(') + 700);
  is(/a\.sat!=='happy'/.test(fn), true, 'rdReviewNow refuses outright unless the visit is happy');
  is(/a\.rvAsked/.test(fn), true, '…and refuses a second time for the same visit');
  is(/rdWaOn\(\)/.test(fn), true, '…and stays silent on a device with no WhatsApp key');
  is(/'\/wa\/review-now'/.test(fn), true, '…then calls the worker, which decides the rest');
}

console.log('2. the worker holds every guard, in one place');
{
  const i = worker.indexOf('async function reviewNow(');
  is(i > 0, true, 'reviewNow exists');
  const fn = worker.slice(i, worker.indexOf('\n}\n', i));
  is(/if \(!cfg\.enabled\)/.test(fn), true, 'the config kill switch');
  is(/control && control\.paused/.test(fn), true, 'the pause switch, no deploy needed');
  is(/waBlockedName\(c\.name\)/.test(fn), true, 'KAPALI is not a customer');
  is(/if \(!phone\)/.test(fn), true, 'no usable telephone, no message');
  is(/gfOptedOut\(c, phone, optout\)/.test(fn), true, 'STOP is STOP — the same list the gap-filler uses');
  is(/cfg\.cooldownDays \* 86400e3/.test(fn), true, 'the cooldown is applied');
  is(/sentToday >= cfg\.dailyCap/.test(fn), true, 'the daily cap is applied');
  is(/if \(cfg\.dryRun\)/.test(fn), true, 'dry run sends nothing');
  is(/waSpec\(env\.WA_REVIEW\)/.test(fn), true, '…and an unconfigured template sends nothing');
}

console.log('3. the instant send and the 19:00 run cannot double up');
{
  const i = worker.indexOf('async function reviewNow(');
  const fn = worker.slice(i, worker.indexOf('\n}\n', i));
  // Both write the same log, in the same shape, BEFORE the message goes.
  is(/fbWrite\(env, 'PUT', RA \+ '\/sent\/' \+ id, rec\)/.test(fn), true,
     'the send is claimed in rdns_review_v1/sent before it goes out');
  is(/st: 'sending'/.test(fn), true, "…as 'sending', so a request that dies leaves a trace");
  is(/src: 'checkout'/.test(fn), true, '…marked as the checkout send, to tell it from the evening one');
  is(/day: todayYmd/.test(fn), true, "…with today's date, so the evening run counts it against the cap");
  // raPlan reads exactly these fields — that is what makes the two agree.
  const plan = worker.slice(worker.indexOf('function raPlan('), worker.indexOf('function raPlan(') + 3000);
  is(/s\.st === 'sending' \|\| s\.st === 'sent'/.test(plan), true, 'the evening run reads the same two states');
  is(/if \(s\.day === todayYmd\) sentToday\+\+/.test(plan), true, '…and the same daily count');
}

console.log('4. the route is wired and keyed');
{
  is(/if \(route === '\/wa\/review-now'\)/.test(worker), true, '/wa/review-now exists');
  // It lives inside handleWa, which is the keyed half — /wa/hook is the only
  // public one. A route that answered without the key would let anyone spend
  // the salon's messages.
  const wa = worker.slice(worker.indexOf('async function handleWa('), worker.indexOf('async function handleHook('));
  is(wa.indexOf("route === '/wa/review-now'") > 0, true, '…behind the shared key, with the rest');
}

console.log('5. the numbers that were throttling it');
{
  const ra = config.slice(config.indexOf('reviewAsk: {'), config.indexOf('reviewAsk: {') + 2200);
  is(/dailyCap: 40/.test(ra), true, 'dailyCap 15 → 40 — a Saturday of twenty happy customers fits');
  is(/cooldownDays: 60/.test(ra), true, 'cooldownDays 180 → 60 — this was the main brake');
  is(/lookbackDays: 7/.test(ra), true, 'lookbackDays 3 → 7 — the evening net catches a missed day');
  is(/enabled: true/.test(ra), true, 'still switched on');
  is(/dryRun: false/.test(ra), true, '…and still live, not a rehearsal');
  // The reason the figures are what they are, kept next to them.
  is(ra.indexOf('219') > 0, true, 'the measurement that justified the change is written down beside it');
}

console.log('');
console.log(fail ? `✗ ${fail} FAILED, ${pass} passed` : `✓ all ${pass} passed`);
process.exit(fail ? 1 : 0);
