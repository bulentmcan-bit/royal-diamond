# WhatsApp template — "Randevu onayı" (the reminder that DEMANDS an answer)

Written 2 Ekim 2026. **NOT yet submitted to Meta.** Nothing sends under this
name until it is approved and `WA_R24` / `WA_R1` are pointed at it.

## Why this exists

The salon's reminders went out and twenty-five customers said nothing back.
That is not the customers being rude — nothing in the message ever asked them
to reply. Both reminders in use today are Piyzi's own stock templates,
`pyz_randevu_hatirlatma_24saat` and `pyz_randevu_hatirlatma_2saat`, and their
only button is a "Detaylar / Details" link. There is no way for a customer to
say "yes I am coming" except by typing it unprompted, and almost nobody does.

So silence meant nothing, and a cancellation only arrived when somebody
happened to type one — which is how an unread "Hello ı cannot come today"
cost the salon two hours.

This template replaces the ask. Two taps, no typing:

| | |
|---|---|
| **✅ Geleceğim / Yes** | she is coming |
| **❌ Gelemiyorum / No** | she is not |

## Why those exact words

A quick-reply tap comes back through the Piyzi webhook as an ordinary message
whose text is the **button's own label** (`/wa/hook` already reads
`m.text || m.button.text`). So the label is not decoration — it is the thing
the dashboard reads.

Both labels were checked against the live `rdWrIsConfirm` / `rdWrIsCancel`
functions in `index.html` before this file was written:

```
"✅ Geleceğim / Yes"     17 chars   confirm=true  cancel=false
"❌ Gelemiyorum / No"    18 chars   confirm=false cancel=true
```

Both are inside Piyzi's 25-character button limit (the limit that forced
`bosluk_teklifi`'s button down from "Evet, isterim / Yes please" to
"Evet / Yes please"). **Do not reword these buttons without re-running that
check** — change "Geleceğim" to "Tamam" and the green band goes blind.

A tap therefore lands straight in the right band with nobody doing anything:
✅ → the green band, ❌ → the red band with ✕ İptal et beside it. Anyone who
still says nothing falls into the amber band to be telephoned.

| Field | Value |
|---|---|
| Template name | `randevu_onay` |
| Category | **UTILITY** — a reminder about an existing appointment, not an offer. The same category as the two it replaces. |
| Language | `tr` |
| Header | none |
| Body variables | **2** · `{{1}}` the Turkish long date ("3 Ekim Cumartesi"), `{{2}}` the hour ("14:00") |
| Footer | none (UTILITY needs no opt-out line) |
| Buttons | 2 · Quick reply `✅ Geleceğim / Yes` · Quick reply `❌ Gelemiyorum / No` |

## Body (paste exactly — blank lines are the paragraph breaks)

```
Merhaba, Royal Diamond Nail Studio'dan hatırlatma.

Randevunuz: {{1}} saat {{2}}

Lütfen aşağıdaki düğmelerden birine dokunarak yanıtlayın.

—

Hello, a reminder from Royal Diamond Nail Studio.

Your appointment: {{1}} at {{2}}

Please tap one of the buttons below to answer.
```

## Submitting it

Piyzi → Kampanyalar → Şablonlar → Yeni Şablon → WhatsApp → Yeni WhatsApp
Şablonu. Category **Hizmet / Utility**, language Türkçe, no header, the body
above, two **quick reply** buttons with the labels exactly as written.

Custom templates do work through Piyzi: `bosluk_teklifi` was submitted this
way on 11 Eylül 2026 and approved on 14 Eylül, and it carries a quick-reply
button, so the shape is proven. Approval has taken from a few minutes to
three days.

## Wiring it, once Meta approves

In `worker/wrangler.toml`, both reminders point at the new name and carry two
body variables instead of one, and no button value (a quick reply has no
dynamic part, unlike the old "Detaylar" URL button):

```
WA_R24 = '{"templateName":"randevu_onay","languageCode":"tr","body":["{dateLong}","{time}"]}'
WA_R1  = '{"templateName":"randevu_onay","languageCode":"tr","body":["{dateLong}","{time}"]}'
```

Then `wrangler deploy`. Confirm the real name and variable order against
`GET /wa/templates` first, exactly as the two current reminders were filled in
on 29 Ağustos 2026 — Piyzi rejects a body array that does not match the
template's own `variableCounts`.

Leave the old values in place until that check passes. A reminder that fails
to send is worse than one nobody answers.
