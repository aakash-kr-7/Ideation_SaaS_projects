# Legal generator facts — current product state

**Last reconciled: 18 July 2026**

This file records observable implementation facts. It is not legal advice and deliberately leaves business decisions unresolved.

## Product and operator

- Product: ShouldBuild
- Operator location stated in the app: India
- Support: support.shouldbuild@gmail.com
- Purpose: public-source product research with deterministic 12-factor scoring and cited reports
- Report modes: Quick Scan and Full Validation
- Automated output is decision support, not a guarantee

## Data and providers

- Account/profile, idea, research, report, citation, comparison, export, support, provider-usage, and error data may be processed
- Configured services: Supabase, Vercel, Google OAuth, Tavily, Firecrawl, Groq, Cerebras, and Cohere
- Tenant boundary: Supabase RLS plus private report-export storage
- No claim of independent security audit or compliance certification
- Operational retention periods and deletion SLAs: unresolved; require deployment-owner approval

## Commerce status

- Active payment provider: none
- Dodo Payments integration: not connected
- Checkout, subscriptions, renewals, cancellations, paid report packs, and one-off purchases: unavailable
- Product transaction/payment-card data collected by ShouldBuild: none in the current product
- Quick Scan entitlement cost: 1 credit
- Full Validation entitlement cost: 3 credits
- Eligible monthly Quick Scan entitlement: implemented as a calendar-month database grant
- Future paid-credit grant boundary: implemented, trusted server use only

## Business and legal decisions still required

- Paid products, prices, currencies, and regional pricing
- Taxes and Merchant-of-Record structure
- Renewal and cancellation rules
- Credit expiry, rollover, transferability, and caps
- Refund and dispute rules
- Data retention, backup, deletion, and support SLAs
- Governing operator entity details and final jurisdiction wording
- Commercial report-use and redistribution rights

Do not generate present-tense billing, refund, tax, subscription, security-certification, or retention claims until the corresponding decision and implementation are verified.
