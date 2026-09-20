# RFC 0002: Whether Bottleneck should ever hold user funds

**Status:** Draft
**Date:** 2026-09-20
**Author:** Matthew Demidoff

## Summary

TON wallet verification and the donor badge are watch-only: the service checks
signatures and watches one address it owns, and never holds a private key that
can move anyone else's money. The proposed billing platform breaks that
property. It would take deposits into a pooled wallet, credit an internal unit
("btGRAM") that apps can charge against, and pay out to a user's verified
address on request.

This RFC argues that the internal unit is the expensive part, not the payments,
and proposes shipping per-invoice non-custodial payments first. Custody stays
available as a later decision, gated on a checklist rather than on enthusiasm.

## Motivation

Integrators need a way to charge for things, and a prepaid balance is the
obvious shape: it makes a charge a database row instead of a five-second
on-chain wait with a user approval dialog, and it is what a subscription centre
wants.

The reason to write this down before building is that the balance is not a
feature, it is a liability on a balance sheet. A user who deposits holds a claim
against us that survives our interest in the project. Three facts about where
this service runs decide most of the argument:

- Production is a docker-compose stack on the maintainer's own Mac behind a
  Cloudflare tunnel. A hot wallet key there is exposed to everything else on
  that machine.
- There are still no automated database backups. RFC 0001 item 1 is open. A
  ledger of what we owe people, with no tested restore, is not a ledger.
- One maintainer. Custody obligations do not pause for a holiday.

## Proposal

Ship model A now. Treat model B as a separate decision with an explicit gate.
Keep model C in view as the answer to recurring charges if one is needed.

### Model A: non-custodial per-invoice payments (recommended)

An app creates a payment request naming its own destination address, an amount
and a nonce. The user pays it directly from their wallet through TON Connect.
We watch for the matching transaction, and on finality issue a signed receipt to
the app over the existing webhook channel. Funds move from the user to the app
and never touch us.

- **Threat model.** No pooled funds and no key to steal. The residual risk is
  asserting a payment that did not happen, which is an indexer lying or a
  non-final transaction being counted. Mitigated by requiring finality and, if a
  receipt ever gates something expensive, by agreeing with a second source.
- **Ledger.** Receipts, not balances. Append-only, idempotent on the transaction
  hash. Nothing to reconcile because we hold nothing.
- **Regulatory.** We attest to a payment between two other parties. That is a
  materially lighter position than holding client assets, though not a blank
  cheque, and it is the position the donor ledger already puts us in.
- **Operational cost.** The donation ingestion loop already being built is most
  of the machinery. No key ceremony, no float, no reconciliation.
- **Exit.** Stop issuing receipts. Nobody's money is stuck.
- **Volatility.** Each invoice is priced and settled at payment time. We carry
  no float, so no price exposure.
- **Cost of the choice.** Every charge is an on-chain transaction: a fee, a few
  seconds, and a user approval. Micro-charges and silent recurring billing are
  not practical.

### Model B: custodial prepaid balance (btGRAM)

Deposits land in a pooled wallet against a permanent per-user memo, credit an
internal balance, apps charge it, and users withdraw to a verified address.

- **Threat model.** One key controls everyone's float, and today that key would
  live on the machine described above. It needs a cold majority with a capped
  hot float, withdrawal limits, and an offline signer. Account takeover becomes
  theft, so changing the payout address needs step-up plus a withdrawal
  cool-down. Both directions are attackable: crediting a deposit that did not
  finalise, and paying out twice because broadcasting an external message is not
  atomic with the database write.
- **Ledger.** Append-only double entry, integer nano units, a non-negative
  constraint enforced by the database rather than by application code, row-locked
  spends, idempotency on the deposit transaction hash and on a client-supplied
  key for charges, plus a reconciliation job comparing the ledger total against
  the on-chain balance and alerting on any drift. Withdrawals need a state
  machine (requested, signed, broadcast, confirmed) with per-payout replay
  protection and confirmation by message hash before any retry.
- **Regulatory.** This is the section that decides it. Holding client crypto,
  issuing an internal unit redeemable for it, and moving value between users and
  apps are custody and transfer activities. In the EU that points at CASP
  authorisation under MiCA; in the US at money-transmitter and MSB registration,
  largely state by state; with KYC, sanctions screening and travel-rule
  obligations attached. Naming the unit btGRAM and promising withdrawal is
  precisely what makes it a redeemable claim rather than a loyalty point. This
  needs a written opinion from a lawyer in the operating jurisdiction. Nothing
  in this document is legal advice.
- **Operational cost.** Key ceremony, offline signer, backups with a rehearsed
  restore, a reconciliation runbook, an incident path for a drift alert at 3am,
  and an answer on accounting and tax for held float.
- **Exit.** The hard one. Shutting down means returning everyone's funds first,
  including users who stopped reading their email a year ago.
- **Volatility.** Balances denominated in GRAM leave price risk with the user,
  which is fine. Any fee taken in GRAM is our exposure.

### Model C: on-chain spending authorisation

The w5r1 extension mechanism lets a user authorise a contract to pull a bounded
amount on a schedule, revocable on-chain, with no key held by us. It is the
honest answer to recurring billing. The cost is writing and auditing a FunC
contract, an upgrade story, and uneven wallet support. A bug is unrecoverable.
Worth revisiting only once a concrete integrator needs recurring pull and model
A has proven the demand.

### The gate on model B

Custody does not start because a balance would be convenient. All of these first:

1. RFC 0001 item 1 shipped: encrypted offsite backups with a restore actually
   rehearsed, plus escrow of the signing key and env file.
2. The wallet key off this host, a capped hot float, and the majority cold.
3. A written legal opinion for the operating jurisdiction covering licensing,
   KYC/AML and the travel rule.
4. Reconciliation and drift alerting proven on testnet, then with amounts small
   enough to lose.
5. The withdrawal state machine tested against a deliberately forced double
   broadcast.
6. A written wind-down procedure naming how funds get returned.

## Alternatives considered

**Telegram Stars.** Given how tightly this service is tied to Telegram, Stars
handle payment, refunds and compliance with no custody on our side. They are
Telegram-denominated, take a platform cut, and cannot pay out to a TON address,
so they answer subscriptions but not the payouts the original idea wanted.

**A fiat processor.** Stripe and its peers solve custody by being the custodian.
Correct for fiat subscriptions and orthogonal to a TON-native audience; worth
having eventually, not instead of this.

**A stablecoin jetton.** Invoicing in USDT on TON removes price volatility from
billing. It is a denomination choice that applies to model A or B equally, not a
separate model, and it adds jetton wallet handling.

**Do nothing.** Verification and the donor badge stand on their own. If no
integrator asks to charge for anything, none of this is needed, and that is a
real possibility worth naming.

## Open questions

- Does any actual integrator want a balance, or would per-invoice payment do?
  Model B should not be built speculatively.
- What is the refund policy once money has moved, and who absorbs a chargeback
  that cannot exist on-chain?
- Which jurisdiction is the operating one, and does the answer change if the
  service incorporates?
- Is "btGRAM" worth the branding, given that an internal redeemable unit is the
  specific thing that attracts the heaviest regulatory treatment? Charging
  directly in GRAM per invoice avoids issuing a claim at all.
- What does an app see when a payment is pending: is a receipt promised within a
  bounded time, and what happens if finality is slow?

## Consequences

Choosing model A keeps the no-private-key property that the rest of the TON work
is built on, and keeps the donation ledger as the single place where on-chain
money is matched to accounts. It makes silent recurring billing impossible until
model C exists, which is the real cost and should be stated to integrators up
front rather than discovered.

Deferring model B means the subscription centre launches without a wallet
balance. If that turns out to be the product, this RFC is superseded rather than
edited, and the gate above becomes the work plan.
