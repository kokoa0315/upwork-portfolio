# Triage eval: rules (rules-v1)

Run 2026-11-03T19:18:06.236Z on the 12 fictional emails in `fixtures/emails.json`. Labels were written by hand before the run.

| | Result |
|---|---|
| Category correct | 10 / 12 |
| Priority correct | 10 / 12 |
| Must-escalate emails flagged for a person | 3 / 3 |
| Flagged without needing it | 0 |
| Errors | 0 |
| Tokens in / out | 0 / 0 |
| Cost (list price) | $0.0000 |
| Median latency | 0 ms |

| Email | Expected | Got | Flag |
|---|---|---|---|
| sample-01 | billing, high | billing, high |  |
| sample-02 | bug, high | bug, high |  |
| sample-03 | account, high | account, **normal** |  |
| sample-04 | how_to, normal | how_to, normal |  |
| sample-05 | feature_request, low | feature_request, low |  |
| sample-06 | billing, normal, escalate | billing, normal | Matched a keyword that always needs a person (refund, deletion, legal, or instructions in the email). |
| sample-07 | bug, urgent | bug, urgent |  |
| sample-08 | other, low | other, low |  |
| sample-09 | account, high, escalate | account, **normal** | Matched a keyword that always needs a person (refund, deletion, legal, or instructions in the email). |
| sample-10 | billing, normal | billing, normal |  |
| sample-11 | other, normal, escalate | **billing**, normal | Matched a keyword that always needs a person (refund, deletion, legal, or instructions in the email). |
| sample-12 | feature_request, low | **other**, low |  |
