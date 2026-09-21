# WhatsApp template — `bosluk_gun` (the gap-filler's offer that names the day)

Submitted 21 Sep 2026 through Piyzi (Kampanyalar → Şablonlar → Yeni Şablon →
WhatsApp → + Yeni Şablon), approved wording by Bülent the same evening.
Status at submission: PENDING at Meta.

It replaces `bosluk_teklifi` (gapfill-offer.md) once Meta approves it. The old
one said "önümüzdeki günler için bir yerimiz açıldı" to everyone; this one names
the slot's day, which is the one fact that makes an offer feel real.

| Field | Value |
|---|---|
| Template name | `bosluk_gun` |
| Category | **MARKETING** ("Meta kategoriyi düzeltebilsin" on) |
| Language | `tr` |
| Header | none |
| Body variables | **one** — `{{1}}` = the day: `bugün`, `yarın`, or the weekday (`Perşembe`). Filled by `gfDayWord()` in worker/src/index.js from the offered slot's date. Sample given to Meta: `yarın` |
| Footer | `Reply STOP if you no longer wish to receive messages.` |
| Buttons | 1 · Quick reply `Evet / Yes please` <br> 2 · Phone `Bizi arayın / Call us` → `+905488933333` |

## Body

```
Merhaba,

Royal Diamond Nail Studio'da {{1}} için birkaç boş saatimiz kaldı.

Size uygun saati ayıralım mı? Bu mesaja yanıt vermeniz yeterli.

—

Hello,

We have a few free slots at Royal Diamond Nail Studio this week.

Just reply to this message and we'll book the time that suits you.
```

## Switching over (only AFTER Meta approves it)

In worker/wrangler.toml:

    WA_GAPFILL = '{"templateName":"bosluk_gun","languageCode":"tr","body":["{day}"]}'

then `wrangler deploy`. Before approval, leave it on `bosluk_teklifi`: a send
naming a PENDING template is refused by Piyzi and every offer that hour fails.
The worker code already fills `{day}` and ignores it for a template whose
spec has no `{day}`, so the code can go live first.
