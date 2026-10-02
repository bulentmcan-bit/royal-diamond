# WhatsApp template — "Müşteri yazdı" (every reply, onto reception's phone)

Prepared 2 Ekim 2026. NOT YET SUBMITTED.

## Why it exists

The salon has two numbers, and that is the whole of the problem it solves.
Reception works from **0548 893 33 33** — the WhatsApp on her own phone.
Every reminder, offer and review request goes out from **0539 140 3333**, the
Piyzi number, so that is where customers reply, and 0548 never sees a word of
it.

A customer wrote "Hello ı cannot come today" to 0539 at 16:03. Reception,
looking at 0548 all day, saw nothing. The owner rang her the next morning to
ask whether she was coming and she said she had already cancelled. The hour
sat in the diary the whole time, so nobody else could have it either. Two
hours lost from one message that went to the other telephone.

WhatsApp will not divert one number to another — there is no such thing. So
the worker does it: `/wa/hook` already receives every reply the instant it
lands, and `hookForward()` sends each one straight on to 0548.

## Why a template and not a plain message

0548 never writes to 0539, so there is no open 24-hour window between the two
numbers and a free-text message would be refused. A template may be sent at
any time, so every forward goes as this one.

| Field | Value |
|---|---|
| Template name | `musteri_yazdi` |
| Category | **UTILITY** — an operational notification to the business's own number, not marketing. Submitting it as MARKETING would be wrong and would also cost more. |
| Language | `tr` |
| Header | none |
| Body variables | **2** — `{{1}}` who wrote, `{{2}}` what she wrote |
| Footer | none (it goes to the salon, not to a customer — no opt-out line) |
| Buttons | none |

## Body (paste exactly)

```
📩 Müşteri mesajı

{{1}}:
"{{2}}"

Yanıtlamak için Piyzi gelen kutusunu açın.
```

Sample values Meta asks for at submission: `{{1}}` = `PELİN`, `{{2}}` =
`Hello ı cannot come today`.

## Wiring, once Meta approves it

In `worker/wrangler.toml`:

```
WA_FORWARD    = '{"templateName":"musteri_yazdi","languageCode":"tr","body":["{who}","{said}"]}'
WA_FORWARD_TO = "905488933333"
```

then `wrangler deploy`.

`{who}` is the customer's name as the salon's own book knows her, falling back
to Piyzi's contact name and then to her number — it is never blank. `{said}` is
her message flattened to one line (Meta rejects a parameter containing a
newline or a run of spaces) and cut to 300 characters, which is more than a
phone notification shows anyway.

## What it will NOT do

- **It never fails a reply.** By the time the forward runs, the message is
  already in Firebase and on the dashboard. A forward that fails is logged
  (`hook-forward`, `failed:<code>`) and nothing else — Piyzi is answered 200
  either way, so it does not retry the whole delivery over a notification.
- **It never guesses.** An empty or broken `WA_FORWARD`, or a missing
  `WA_FORWARD_TO`, means it does nothing and says so in the log. Same contract
  as WA_R24, WA_GAPFILL and the rest.
- **It never loops.** A message from 0548 itself is not forwarded to 0548.

## The thing that would make this unnecessary

WhatsApp **Coexistence** lets one number run on the WhatsApp Business app and
the Cloud API at the same time, syncing up to six months of chat history. If
the API moved from 0539 onto 0548 there would be ONE customer-facing number:
reception uses WhatsApp exactly as she does now, the reminders go out from the
same number, and the replies appear on her phone and in Piyzi and on the
dashboard without anything being forwarded anywhere.

Whether **Piyzi** supports Coexistence is not in their documentation and must
be asked, not assumed. It is one question and it would remove this template.
