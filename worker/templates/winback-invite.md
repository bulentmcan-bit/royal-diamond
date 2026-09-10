# WhatsApp template — "Farkı kendiniz görün" (win-back invite)

Prepared 10 Sep 2026 for submission through Piyzi (Meta approval). It carries
**no customer name and no variables at all** — one fixed text, so it needs no
`{name}` header and no body parameters, and `/wa/send` can post it with an
empty `params` list once it is approved.

| Field | Value |
|---|---|
| Template name | `pyz_tekrar_davet_v2` (Piyzi prefixes as it does the others; confirm with `GET /wa/templates`) |
| Category | MARKETING (an invitation, not a transaction — Meta will reclassify a UTILITY submission) |
| Language | `tr` (body carries Turkish first, English second, the same way the salon speaks to its customers) |
| Header | none |
| Body variables | none |
| Footer | the opt-out line below (Meta requires an opt-out on marketing templates) |
| Buttons | 1 · URL "Randevu Al / Book online" → `https://royaldiamondnails.com/booking.html?src=wa` — the PUBLIC booking page. Never the bare domain: `https://royaldiamondnails.com/` serves index.html, the management app, and a customer tapping it meets the login gate <br> 2 · Phone "Bizi arayın / Call us" → `+90 548 893 3333` |

## Body (paste exactly — blank lines are the paragraph breaks)

```
Merhaba,

Royal Diamond Nail Studio'da işimizi en iyi şekilde yapmaya devam ediyoruz.

Sizi tekrar ağırlamaktan ve farkı kendiniz görmenizden memnuniyet duyarız.

Randevunuz bir dokunuş uzağınızda.

—

Hello,

At Royal Diamond Nail Studio we continue to do our work to the highest standard.

We would be delighted to welcome you back and let you see the difference for yourself.

Your appointment is one tap away.
```

## Footer

```
Reply STOP if you no longer wish to receive messages.
```

## Notes for submission

- The URL button must be typed into Piyzi exactly as above, with `/booking.html?src=wa`.
  The bare domain is the management app behind a password prompt, not the
  booking page — that is the one mistake a customer would notice first.

- Body is 413 characters, well under Meta's 1,024 limit; the footer is under 60.
- The em dash on its own line is the divider between the Turkish and the English.
- The STOP line is the footer, not part of the body, so it renders small and grey
  the way Meta expects an opt-out to.
- Because there are no variables, the sample values Meta asks for at submission
  are simply the text itself.
- Once approved, wire it in `wrangler.toml` like the others:
  `WA_WINBACK = '{"templateName":"<name from /wa/templates>","languageCode":"tr","body":[]}'`
  and send with `POST /wa/send {phone, templateName, params: []}`.
