# WhatsApp template — "Kaş & Kirpik · Salı & Perşembe" (Beyhan announcement)

Prepared 30 Eylül 2026. NOT YET SUBMITTED. This is the one-off marketing
announcement that tells existing customers what Beyhan does and which days
she is in, so they can book her. It is the WhatsApp twin of the printed
"Royal Diamond — Kaş & Kirpik" card Glyn is putting on Instagram and
Facebook, and it must say the SAME days as that card: **Salı & Perşembe**
(crown-config.js `beyhan.workdays = [2, 4]`, restored 30 Eylül 2026).

| Field | Value |
|---|---|
| Template name | `kas_kirpik_gunleri` |
| Category | **MARKETING** — an announcement, not a transaction. Never the r24/r1 reminder templates (UTILITY). |
| Language | `tr` (Turkish first, English second, an em dash between — the way the salon speaks, same as `bosluk_teklifi`) |
| Header | **none** — see "Why no picture, for now" below |
| Body variables | **none** — one fixed text, so Meta needs no sample values beyond the text itself and approval is the quickest kind |
| Footer | the opt-out line below (Meta requires an opt-out on marketing templates) |
| Buttons | 1 · Phone "Bizi arayın / Call us" → `+905488933333` <br> (a quick-reply button is optional; a customer can simply answer the message) |

## Body (paste exactly — blank lines are the paragraph breaks)

```
Merhaba,

Kaş & kirpik uzmanımız Beyhan, Royal Diamond'da artık SALI ve PERŞEMBE günleri 08:00 - 18:00 arası sizinle.

Microblading · Pudralama · Altın Oran Kaş Alımı · Kaş Vitamini (dermapen) · Kaş Silme (solüsyon) · Kirpik & Kaş Lifting (laminasyon) · Klasik ve Volume Kirpik

Randevu için bu mesaja yanıt verin veya bizi arayın: 0548 893 33 33

—

Hello,

Our brow & lash specialist Beyhan is now at Royal Diamond on TUESDAYS and THURSDAYS, 08:00 - 18:00.

Reply to this message or call us for an appointment.
```

## Footer

```
Reply STOP if you no longer wish to receive messages.
```

## TO CONFIRM WITH BÜLENT BEFORE SUBMITTING

- **The two badges on the printed card — PHIBROWS ARTIST and MYLAMINATION
  ELITE CLASS — are deliberately left out of this text.** The card does not
  name anyone, so which person holds those certificates is not established.
  They go in only if Bülent confirms they are Beyhan's.
- **Four of the services on the card have never appeared in the appointment
  history** (checked against the live book on 30 Eylül 2026, 2.901
  appointments): **Pudralama, Kaş Vitamini (dermapen), Kaş Silme (solüsyon)
  and Kirpik & Kaş Lifting (laminasyon)** — not once. They are in the text
  because they are on his card, not because the books show them. If any one
  of them is not actually offered it must come out before submission — an
  advertised treatment nobody can do is worse than a shorter list.
  Microblading DOES appear (2 bookings), so it stays.

## Why no picture, for now

The card is an image, and an image CAN ride on a template as a media header.
Two things stand between here and that:

1. A media-header template needs a sample image uploaded at submission and a
   fresh Meta approval (1–3 days), and every send must then carry a header
   parameter. `worker/src/index.js:585` already builds those
   (`parameters.header = spec.header.map(sub)`), so our side is ready.
2. **Whether Piyzi's `POST /whatsapp/messages` accepts a media header is not
   documented.** It is not assumed either way — it has to be checked against
   `GET /whatsapp/templates` or asked of Piyzi.

A text-only template needs neither, so it is the version that can go out
first. The picture version can follow once (2) has a real answer.

## Who it goes to — NOT everybody

838 clients, 801 with a usable phone. This does **not** go to 801.

The list was cut from the live book on 30 Eylül 2026: every client with at
least one kaş or kirpik treatment in her history, cancellations and no-shows
not counted — **80 clients**. One has no usable phone; three share a number
with another record, so each number appears once. **76 recipients**, delivered
as `kas-kirpik-gonderim-listesi.xlsx` and split into three parties of about 30
a day (1–30, 31–60, 61–76).

**No customer name or telephone number belongs in this repository.** It is
public, and anything written here stays in the history even after it is
deleted. The list itself lives only in the spreadsheet on the salon's own
machine; what follows is the shape of it, which is all this file needs.

Three of the eighty records share a telephone number with another record —
each number was written once. They are either the same customer entered
twice or a wrong number, and the book should be fixed either way. The
spreadsheet's "Açıklama" sheet names which ones.

Three numbers are not +90 (one Cyprus, one UK, one Australia). Piyzi's
importer takes only +90, so those three are not in Piyzi's customer list and
have to be handled by hand.
Reason: these marketing sends leave on **0539 140 3333** — the same sender
that carries every appointment reminder. A blast to 801 strangers invites
blocks and "report", Meta drops the number's quality rating, and the
reminders go down with it. These 76 are customers who have had the treatment
and will read it as news, not as spam.

Anyone who replies STOP is handled at Piyzi's end; her number can also go
under `rdns_gapfill_v1/optout`, or "mesaj istemiyor" in her notes.
