# RFC 0003: Custodial billing, with manual payouts and a KYC gate

**Status:** Accepted
**Date:** 2026-09-20
**Author:** Matthew Demidoff
**Supersedes:** the recommendation in RFC 0002

## Summary

RFC 0002 recommended non-custodial per-invoice payments and put custody behind
a gate. The owner has decided to build the custodial platform: users deposit
GRAM, hold a spendable balance, apps charge it, and users withdraw to their
verified TON address.

Two decisions make that materially safer than the version RFC 0002 argued
against, and this RFC records them so the shape is not relitigated later.

## Decision 1: no payout key on the server

Withdrawals are requested in the app, queued, and announced to the operator
over Telegram. The operator sends the payment from their own wallet. The
chain watcher already ingesting donations confirms the outbound transaction and
marks the request paid.

The server therefore never holds a key that can move user funds. The worst a
host compromise can do is lie about balances, which is recoverable from the
ledger and the chain; it cannot drain the float.

This was chosen over a hot wallet, and over a capped hot float with cold
backing. At current volume manual signing costs minutes a day. The user-facing
flow is identical to an automated one, so automating it later behind the RFC
0002 gate changes no contract.

## Decision 2: withdrawals are gated on operator-reviewed identity

Deposits and in-app spending are open. Withdrawal requires an approved identity
application: the user submits legal details and identity documents, the
operator reviews, and only an approved account can withdraw.

Note what this does and does not do. It is a sanctions and fraud control, and
it is the kind of control a licensed operator is expected to run. It does not
by itself make holding client funds lawful in any jurisdiction. That question
is open and belongs to the owner and a lawyer; nothing in this document is
legal advice.

## Consequence: identity documents are the new crown jewels

Holding passport and ID photographs is a larger liability than holding the
GRAM. It is high-value to an attacker, tightly regulated, and it lands on a
host that is also the maintainer's personal machine.

Documents are therefore **never stored in readable form by this service**. Two
acceptable shapes:

1. **A KYC provider** (Sumsub, Veriff, Persona and similar). The provider holds
   the documents; we store an applicant reference and a decision. Least
   liability, and the default recommendation.
2. **Self-hosted, encrypted to an offline recipient.** An upload is encrypted
   with age to a recipient whose identity lives offline, exactly as the backups
   are, so the server can accept a document it cannot read. The operator
   decrypts locally to review, and the ciphertext is deleted once a decision is
   recorded.

Either way the database holds a decision, a reviewer, a timestamp and the
minimum identifiers, never an image. Retention is bounded and written down.

## Ledger rules

These are not negotiable once real balances exist:

- Append-only double entry. A balance is derived from entries, never a column
  that is incremented.
- Integer nano units in `numeric`, `BigInt` in code. A nanocoin total passes
  2^53 at nine coins.
- A non-negative constraint enforced by the database, not by application code.
- Spends take a row lock; idempotency keys on every charge so a retried request
  cannot double-charge.
- A reconciliation job compares the ledger total against the on-chain balance
  of the deposit address and alerts on any drift.
- Withdrawal state machine: requested, approved, sent, confirmed, with the
  chain transaction hash recorded at confirmation. Nothing marks itself paid.

## Open questions

- Which of the two document shapes. The provider route is recommended and is a
  cost question more than an engineering one.
- What happens to a balance when an account is deleted, and what happens to an
  unwithdrawn balance if the service winds down. RFC 0002 asked for a written
  wind-down procedure; it is still owed.
- Whether balances are denominated in GRAM (user carries price risk, simplest)
  or in a stable unit (we carry it).
- Refunds: an app charge that the user disputes has no chargeback mechanism
  on-chain, so the policy has to be written before the first dispute.
