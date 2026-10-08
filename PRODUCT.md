# Product
<!-- impeccable:product-schema 1 -->

## Platform
web

## Users
Primary, for the judge page: judges of Colosseum Crypto World's Fair, Base track (David Tso, Ecosystem & Ventures at Base), who give each project well under a minute, have no wallet connected, and decide whether the claim is real and whether agents on Base would use it.

Product users after the event: API sellers that already charge per call over x402, and builders of AI agents that buy services with a budget set by a person (the principal).

## Product Purpose
Sealed lets an AI agent negotiate a price without showing the other side its budget first. If the seller's agent sees the buyer's maximum, it charges the maximum. Success for the page: a judge understands that sentence, sees a real negotiation and payment happen on Base Sepolia, and can check every step on Basescan.

## Positioning
Sealed-bid price negotiation between agents on Base: offers are committed as hashes, a referee (the clearing relay) answers only whether they crossed, settlement is one atomic transaction at the midpoint, and a failed negotiation publishes no offer. The buyer then pays the settled price per call over x402, drawing each call's price from its principal's Base Account under a Spend Permission. No project found in the field negotiates price with sealed offers.

## Operating Context
Judges open the live page (https://sealed-base.vercel.app) and the public repo (github.com/kasbsquall/sealed-base). Every claim links to a Basescan transaction. Verification scripts (`npm run verify:run`, `npm run verify:payments`) re-derive hashes and payments from the committed transcripts in `demo-runs/`.

## Capabilities and Constraints
- Contracts on Base Sepolia, verified on Sourcify (exact match): SealedNegotiation `0x0C0E12C9C77FAcDa9302514A818DF232346e773A`, ReputationGate `0xDC237A8ade5dd125A18146f1b5943eE4E975a407`, reading the canonical ERC-8004 registries.
- Agents decide with a local model (Qwen 2.5 14B on Ollama); code clamps every number to the principal's limit.
- The referee sees both numbers of a round that does not cross; it holds no agent key and cannot forge a deal. This is stated on the page, not hidden.
- The page is a static export (Next.js 16) built only from committed files; it reads live contract state with one `eth_call`.
- Testnet only. The 0.25% fee is a plan, not implemented in the contracts.

## Brand Commitments
- Name: Sealed.
- Binding (user, 2026-10-08): the Cruce isotipo (two asymmetric crossing lines, square caps, a small square where they cross) and signal orange `#FF4F1A` used only at the settlement point. Typography, background and layout are free per direction.
- Voice: plain, exact, no hype; every number with its unit; limits stated.
- No emojis anywhere.

## Evidence on Hand
- Negotiation #6: three rounds, settled at 4200 US cents per 1,000 calls (`demo-runs/baseSepolia-deal-6.json`).
- Negotiation #7: never crossed, expired with no offer on-chain (`demo-runs/baseSepolia-no-deal-7.json`).
- Negotiation #8: same deal with referee and agents in separate processes (`demo-runs/baseSepolia-deal-8-separated.json`).
- x402 payments from a Base Account: three draws and three payments of $0.042, a refused surge call at $0.084, a fourth draw rejected by Base with `ExceededSpendPermission(168000, 126000)` (`demo-runs/baseSepolia-x402-6-base-account.json`).
- 52 tests, `docs/ADDRESSES.md` with every transaction.
- Absent and not to be fabricated: users, customers, pilots, testimonials, mainnet volume, audits.

## Product Principles
1. Proof before claim: every statement on the page is one click from its transaction.
2. Say the limit next to the claim it limits.
3. One sentence of pain before any mechanism.
4. The judge never needs a wallet, an install or an account.

## Accessibility & Inclusion
WCAG AA contrast, keyboard reachable controls, reduced motion respected; the page must work at 390 px wide.
