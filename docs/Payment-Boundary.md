# Provider-Neutral Payment Boundary

Payments are not implemented. There is no checkout, subscription management, webhook route, provider SDK, or credit-purchase UI. Dodo Payments is the intended future provider, but the interface remains provider-neutral until an implementation is explicitly approved.

## Future catalog decisions

The future catalog must define immutable provider product/price identifiers, currency, tax behavior, and eligibility for:

- one Quick Scan purchase (one research credit);
- one Full Validation purchase (three research credits);
- credit packs;
- subscriptions with a documented periodic grant.

Prices, renewal, expiry, rollover, cancellation, refund, and dispute terms are deliberately undecided and must be published before checkout exists.

## Required future flow

1. The server creates a provider checkout from a server-owned catalog mapping; the browser never determines credits or price IDs.
2. A verified provider webhook is deduplicated by provider event ID and payment/period reference before it writes the payment ledger.
3. Only a trusted server path calls the existing idempotent credit-grant RPC with that immutable external reference.
4. A research launch atomically reserves credits and completion consumes or restores exactly once. Entitlement checks remain server/database enforced.
5. Refunds, chargebacks, and disputes are ledger events. They must not silently mutate balances or reverse credits already consumed by a completed report without an explicit operator policy.

## Future data and security requirements

- Maintain a provider-neutral payment ledger with provider name, external event/payment/subscription IDs, customer/team ownership, amount/currency, event state, idempotency key, and audit metadata.
- Preserve the existing credit reservation and finalization audit trail; no browser or direct-table credit mutation is permitted.
- Verify provider signatures against a server-only secret using timing-safe comparison; retain raw-event hashes and processing outcomes for reconciliation.
- Apply RLS so customer payment history is tenant-scoped and all provider reconciliation is service-role only.
- Add `PAYMENTS_PROVIDER`, `DODO_API_KEY`, `DODO_WEBHOOK_SECRET`, and `DODO_ENVIRONMENT` only to server-only deployment secrets when implementation starts. None may use `NEXT_PUBLIC_`.

No Stripe integration is present or planned in this repository.

