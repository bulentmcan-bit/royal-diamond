# WhatsApp template — "Yerimiz açıldı" (the gap-filler's offer)

Prepared 11 Sep 2026 for submission through Piyzi (Meta approval). This is
the ONE message the automatic gap-filler (worker/src/index.js, `runGapFiller`)
sends. It carries **no customer name and no variables at all** — one fixed
text — because the same wording must fit every customer and every slot: the
slot itself (day, hour, technician) is written to `rdns_gapfill_v1/offers`
and shown in the app's panel, so reception knows what was offered to whom
when the customer replies.

| Field | Value |
|---|---|
| Template name | `pyz_yerimiz_acildi_v1` (Piyzi prefixes as it does the others; confirm with `GET /wa/templates`) |
| Category | **MARKETING** — an offer, not a transaction. Never the r24/r1 reminder templates, which are UTILITY and would be misused for this. |
| Language | `tr` (Turkish first, English second, an em dash between, the way the salon speaks) |
| Header | none |
| Body variables | **none** |
| Footer | the opt-out line below (Meta requires an opt-out on marketing templates) |
| Buttons | 1 · Quick reply "Evet, isterim / Yes please" <br> 2 · Phone "Bizi arayın / Call us" → `+90 548 893 3333` |

## Body (paste exactly — blank lines are the paragraph breaks)

```
Merhaba,

Royal Diamond Nail Studio'da önümüzdeki günler için bir yerimiz açıldı.

İsterseniz bu mesaja yanıt verin, size uygun saati hemen ayarlayalım.

—

Hello,

A slot has opened up at Royal Diamond Nail Studio in the next few days.

Reply to this message and we will arrange the time that suits you.
```

## Footer

```
Reply STOP if you no longer wish to receive messages.
```

## Notes for submission

- No name, no time, no date in the text: a variable would need per-customer
  sample values and a header, and the offer's details live in the app's
  panel instead — reception answers the reply with the exact slot.
- The quick-reply button is what makes answering a one-tap thing on the
  customer's side; her reply arrives on the salon's WhatsApp like any other
  message. The phone button is the fallback.
- Because there are no variables, the sample values Meta asks for at
  submission are simply the text itself.
- Once approved, wire it in `wrangler.toml` like the others:
  `WA_GAPFILL = '{"templateName":"<name from /wa/templates>","languageCode":"tr","body":[]}'`
  and `wrangler deploy`. Until then a LIVE run (gapFill.dryRun=false in
  crown-config.js) refuses to send and records `TEMPLATES_NOT_CONFIGURED`
  in its run record; a dry run needs no template at all.
- A customer who replies STOP is handled at Piyzi's end; on our side her
  number can also be put under `rdns_gapfill_v1/optout` with the panel's
  🚫 button, or "mesaj istemiyor" written in her notes — either stops every
  future offer to her.
