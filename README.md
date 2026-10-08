<img src="docs/brand/sealed-mark.svg" width="56" alt="Sealed mark: two crossing lines with an orange square at the crossing point">

# Sealed

**Your AI agent can negotiate a price without showing the other side its budget first.**

Built on Base · ERC-8004 verified identity and reputation · payment over x402 · Colosseum Crypto World's Fair, Base track.

**Live demo: [sealed-base.vercel.app](https://sealed-base.vercel.app)**. Scroll once and a replay walks through a real negotiation on Base Sepolia, from the first sealed offer to the USDC payment, with a link to every transaction. No wallet needed.

---

## The problem

You give an AI agent a budget and ask it to buy API access. The seller runs an agent too. If the seller's agent learns your ceiling, it charges your ceiling. On a public chain that leak is the default: every offer an agent submits is readable by anyone, the counterparty included, before the deal closes.

Sealed changes the order in which numbers become visible. Both agents commit sealed offers to Base. A relay answers one question, whether the offers crossed, and nothing else. When they cross, one transaction settles at the midpoint, which makes the two final offers public, and the buyer then pays that price per call in USDC over x402. When they never cross, no offer is ever made public.

ERC-8004 already answers whether an agent can be trusted: its Identity and Reputation registries live at the same addresses on Base and more than twenty other chains. Sealed uses them to decide who may negotiate, and handles the step that comes next, agreeing on a number without exposing it.

## What it does

Two agents, each with an ERC-8004 identity and reputation on Base, reach an agreement through a contract that never learns either position until both are locked, and never learns either position at all if the deal does not happen.

1. **Admission.** `ReputationGate` checks both agents against an explicit, on-chain policy read from the canonical ERC-8004 Reputation Registry. It answers one bit: does this agent clear the bar. The registry itself is public, so the gate saves the counterparty a lookup rather than hiding anything.
2. **Commitment.** Each agent submits a salted, domain-separated hash of its position. Counter-offers are new commitments, and the same number committed twice produces two unrelated hashes, so an observer watching a sequence of updates cannot tell whether an agent moved or held.
3. **Atomic settlement.** There is no reveal phase. `settle` consumes both offers, both salts and both EIP-712 authorizations in a single transaction. Either both positions land on-chain in the same instant or neither ever does.
4. **Silent failure.** If the positions do not clear, nothing is submitted and the negotiation expires. The chain records that two agents talked and did not trade. It never records what either one asked for.

Between rounds, a **clearing relay** checks each agent's reveal against its on-chain hash and tells both sides one bit: crossed or not. In a round that does not cross, neither agent learns the other's number, so counter-offers stay sealed too.

## Why textbook commit-reveal is not enough here

The standard sealed-bid pattern is commit a hash, then reveal. In an auction with many bidders and a deposit at stake, fine. In a two-party negotiation it fails in two specific ways, and both are fixed in [`SealedNegotiation.sol`](contracts/SealedNegotiation.sol).

**Last-revealer advantage.** If A reveals first, B reads A's number and then decides whether revealing still suits it. B walks away having learned everything while exposing nothing. In a bilateral deal that asymmetry is the whole game.

Sealed removes the reveal phase entirely. Settlement is one atomic call carrying both sides, each authorized by an EIP-712 signature bound to the exact pair of commitment hashes and their round indices. Nobody goes first because there is no first. A stale authorization from an earlier round is void the moment either side re-commits.

**A price is not a 256-bit secret.** `keccak256(price)` over a plausible range is brute-forced in milliseconds. Sealed's commitment pre-image binds the EIP-712 domain separator (chain id and contract address), the negotiation id, the committing party, the round index, the offer and a 32-byte salt.

## What Sealed does not claim

Checking whether two sealed numbers cross needs someone to see both. In Sealed that is the clearing relay ([`agents/relay/clearingRelay.ts`](agents/relay/clearingRelay.ts)), and its power is deliberately narrow:

- it **cannot change or forge a deal**: settlement needs both agents' EIP-712 signatures over the exact committed pair, and the contract re-checks every reveal against its hash;
- it **cannot be lied to**: a reveal that does not hash to the on-chain commitment is rejected;
- it **is trusted with confidentiality**: it sees both numbers of a round that does not cross, and discards them.

So neither the chain, nor the counterparty, nor the model provider ever learns an agent's position unless the deal settles. The relay does, briefly. The production path is to run it inside an attested TEE, or to replace the comparison with threshold encryption or an FHE coprocessor.

The relay holds no agent key. In [negotiation #8](https://sepolia.basescan.org/tx/0xb0d8a3189a0ffc4a2d48f1c93b27c0416bb3b160515d0764c64b386a335a8136) the buyer agent, the seller agent and the relay ran as three separate processes ([`scripts/run-separated.ts`](scripts/run-separated.ts)): each agent loaded only its own key and limit and ran its own model client, and the relay reached them over HTTP ([`agents/relay/party.ts`](agents/relay/party.ts)). All three ran on the operator's machine, and this README says so.

Timing metadata is public. The mempool shows that an address committed and when. It never shows what.

Two more limits a reviewer will find in the code. `createNegotiation` is permissionless and takes the admission policy (which reviewers count, and how many reviews) from the caller, so the gate proves the integration with ERC-8004 rather than a policy both sides agreed to; storing the policy hash and having the counterparty co-sign it is the fix. And the NatSpec at the top of `SealedNegotiation.sol` describes agents exchanging reveals with each other, which predates the clearing relay; the contract is left unchanged because it is deployed and verified byte for byte, and this README describes the current flow.


## Architecture

```
ERC-8004 canonical registries on Base        (read only, not deployed by us)
  IdentityRegistry      0x8004A818BFB912233c491871b3d84c89A494BD9e  (Base Sepolia)
  ReputationRegistry    0x8004B663056A597Dffe9eCcC1965A193B7388713  (Base Sepolia)
        |
        v
  ReputationGate.sol      admission policy over the public registries, one bit out
        |
        v
  SealedNegotiation.sol   commitment, counter-offers, atomic settlement, silent expiry
        |
        v
  NegotiatorAgent         decides each round's number with a local model (Qwen 2.5
                          14B on Ollama); code clamps it to the mandate
        |
        v
  ClearingRelay           checks reveals against on-chain hashes, answers one bit
                          per round, submits the atomic settlement or the expiry
        |
        v
  x402 payment            the buyer pays the seller's API per call in USDC on Base,
                          at the settled price, and refuses any other terms
        |
        v
  Base Account budget     the money comes from the principal's Base Account; a
                          Spend Permission caps what the agent can draw per day
```

### The mandate never leaves the operator's machine

An agent's mandate (the most it may pay, the least it may accept) is exactly the secret Sealed protects. Sending it to a hosted model provider on every turn would leak it to a third party. So the negotiator runs on a local model through Ollama by default. Any OpenAI-compatible endpoint works by changing `LLM_BASE_URL` and `LLM_MODEL`, if an operator prefers a hosted model.

The model proposes and the code disposes. Whatever the model says, [`NegotiatorAgent`](agents/negotiator/negotiator.ts) never commits past its principal's limit, never walks back an earlier concession, rejects answers on the wrong scale, and records every correction. In the live no-deal run #7 the code corrected the model three times.

See [docs/ARCHITECTURE.md](docs/ARCHITECTURE.md) and [docs/ADDRESSES.md](docs/ADDRESSES.md).

### After the deal, the buyer pays at the settled price over x402

Negotiation #6 settled a price for API access: 4200 US cents per 1,000 calls, which is 42,000 atomic USDC per call. The seller's API ([`agents/x402/sellerService.ts`](agents/x402/sellerService.ts)) charges per call over x402, with the price and the payee read from the settled negotiation on-chain. The buyer's client ([`agents/x402/buyerClient.ts`](agents/x402/buyerClient.ts)) reads the same deal and, before signing anything, compares it with the server's 402 requirement. A different amount, payee, asset or network aborts the payment. The demo seller also exposes a surge endpoint at twice the price, and the buyer refuses it.

The money does not sit in the agent's wallet. It sits in the principal's **Base Account**, which grants the buyer agent a **Spend Permission** through Base's SpendPermissionManager: at most $0.126 a day, exactly three calls. Before each call the agent draws that call's price, then pays. A compromised agent can still only spend what the principal allowed ([`agents/x402/baseAccount.ts`](agents/x402/baseAccount.ts)).

In the live run the principal's Base Account granted the permission in [`0x7bcf0016…`](https://sepolia.basescan.org/tx/0x7bcf00165932ce9be1f81e6fb1a5cec299f68055a9cdd95390821c0f9e3a7573); the agent drew $0.042 three times and paid three calls, refused the surge call at $0.084, and a fourth draw was rejected by Base with `ExceededSpendPermission(168000, 126000)`. The transactions are in [docs/ADDRESSES.md](docs/ADDRESSES.md).

```bash
BUDGET=base-account npm run pay:x402                        # the agent draws from a Base Account
npm run verify:payments -- demo-runs/baseSepolia-x402-6-base-account.json
```

## Running it

```bash
npm install
npx hardhat test            # runs against the real ERC-8004 registry code
npm run check:registries    # calls the live registries on Base Sepolia
```

The test suite is where the privacy claims are proved rather than asserted. Among the cases:

- a committed position leaves no trace of the offer or the salt in any log
- the same offer in a later round produces an unrelated commitment
- one party's authorization is never enough to settle, even signed twice
- re-committing voids every authorization signed against the previous round
- a commitment cannot be replayed against another deployment of the same contract
- an expired negotiation puts neither position on-chain
- the agent's own off-chain commitment encoder matches the contract exactly, across the full uint256 range
- an agent never commits past its mandate, whatever the model answers
- the relay refuses a reveal that does not match the on-chain commitment
- an agent fails closed when its model gives no usable answer

Run a negotiation with the relay and each agent in separate processes (needs Ollama for the agents' model and `DEPLOYER_PRIVATE_KEY` for the relay's gas):

```bash
npx tsx scripts/run-separated.ts
```

Deploy to Base Sepolia (chain id 84532):

```bash
cp .env.example .env   # fill in DEPLOYER_PRIVATE_KEY with a fresh faucet-funded wallet
npm run deploy:base-sepolia
```

## Verify it in two minutes

Everything below is on Base Sepolia and readable without a wallet.

1. **The contracts are the code in this repo.** [`0x0C0E12C9C77FAcDa9302514A818DF232346e773A`](https://sepolia.basescan.org/address/0x0C0E12C9C77FAcDa9302514A818DF232346e773A) and [`0xDC237A8ade5dd125A18146f1b5943eE4E975a407`](https://sepolia.basescan.org/address/0xDC237A8ade5dd125A18146f1b5943eE4E975a407) are verified on Sourcify with an exact match.
2. **They read the real ERC-8004 registries.** `ReputationGate` was deployed pointing at the canonical Identity and Reputation registries (`0x8004A818…`, `0x8004B663…`), and `npm run check:registries` calls them live.
3. **A negotiation settled on-chain without either offer appearing before settlement.** Open the two commit transactions of negotiation #1, [`0xa62210cd…`](https://sepolia.basescan.org/tx/0xa62210cd8ab8d1288f80b7df487de2a0bf3f347ca7e9eb9123e01e6d75a043dc) and [`0x1d6f6ad1…`](https://sepolia.basescan.org/tx/0x1d6f6ad16a7b9c1272ce360949d0e702c2ba1c28435cfeff8c8ddbb3e3ae49b3): each carries a 32-byte hash and nothing else. Both offers become public together, only in the settlement [`0x3c8a95a1…`](https://sepolia.basescan.org/tx/0x3c8a95a18eb705f34a22e76be6c813b545ff0602ebd3c99e695d22964cbe35c9).
4. **Two AI agents negotiated on Base Sepolia with a local model.** In [negotiation #6](https://sepolia.basescan.org/tx/0x772b8170d9c247d73fa1e3daa93541024c855a8a1d0f2bcbe101f6fad8830a5e) rounds 1 and 2 did not cross (4100 against 4200, then 4100 against 4150); in round 3 both went to their limits, the numbers crossed, and the deal settled at the midpoint, 4200. In [negotiation #7](https://sepolia.basescan.org/tx/0x9a83c35c6dcd7f6081f3bd2ec8bec14784baa7bf59e5bc72a4b4659dea5590be) the mandates could not overlap: the model tried to open past each principal's limit, code held both agents at their limits, three rounds did not cross, and the negotiation expired with neither number on-chain. The transcripts are in [`demo-runs/`](demo-runs), and `RUN=demo-runs/baseSepolia-deal-6.json npm run verify:run` re-derives every on-chain hash from them. Negotiations #3 and #5 are earlier runs of the same scenarios with the previous prompt. [Negotiation #8](https://sepolia.basescan.org/tx/0xb0d8a3189a0ffc4a2d48f1c93b27c0416bb3b160515d0764c64b386a335a8136) is the deal scenario again with the relay and each agent in separate processes; `RUN=demo-runs/baseSepolia-deal-8-separated.json npm run verify:run` checks it.
5. **The settled price is what gets paid, from a capped budget.** After negotiation #6 the buyer drew $0.042 from its principal's Base Account and paid the seller's API over x402, three times: [`0x0ab24db0…`](https://sepolia.basescan.org/tx/0x0ab24db044cbd2585c5685ac29265e1b016124967fee1ffe09264860e8863fa3), [`0x03a80690…`](https://sepolia.basescan.org/tx/0x03a806901781845c367fe0f4c1f0e317e2dd009218fd44e10fe67bea5504bb60), [`0x9064190f…`](https://sepolia.basescan.org/tx/0x9064190fda4ac35c74959cdb38ed49f077999db077446e4ed1c959318b418026). A call priced at double was refused before anything was signed, and a fourth draw was rejected by Base's SpendPermissionManager. `npm run verify:payments -- demo-runs/baseSepolia-x402-6-base-account.json` checks every payment and every draw against the contract.
6. **The demo reputation is seeded, and labelled that way.** Agents 9341, 9342 and 9343 and their reviewers were created by `scripts/seed-demo.ts`. See [docs/ADDRESSES.md](docs/ADDRESSES.md).

## Business model

This is the plan after the event; the demo charges no fee.

- **Who pays.** The seller, 0.25% of the value paid at a price settled through Sealed.
- **First customers.** API sellers that already charge per call over x402. Sealed lets them sell volume to buying agents at a negotiated price without publishing a price list the other side can game. A buyer agent that cannot be squeezed is willing to commit to volume.
- **What the seller gains.** In negotiation #6 the seller would have accepted $41.00 per 1,000 calls and closed at $42.00, while the buyer paid $1.00 less than its $43.00 ceiling. At 1,000,000 calls a month at $0.042 per call, the seller earns $42,000 and Sealed $105. The fee is not implemented in the contracts yet.
- **Next, in order.** Move the referee (the clearing relay) into an attested enclave, code the fee into settlement, deploy on Base mainnet, and run a pilot with one x402 seller.
- **Team.** Kevin Soto Burgos, founder, will build Sealed full-time after the event.

## Status

| | |
|---|---|
| ERC-8004 integration researched and addresses confirmed | done |
| `SealedNegotiation.sol` with atomic EIP-712 settlement | done, tested against the real ERC-8004 registry code (52 tests in the suite) |
| `ReputationGate.sol` with explicit on-chain admission policy over trusted reviewers | done, interface checked against live Base Sepolia |
| Deployment to Base Sepolia, source verified on Sourcify | done, see [docs/ADDRESSES.md](docs/ADDRESSES.md) |
| First live negotiation on Base Sepolia (scripted) | done, settled on-chain |
| Negotiator agent on a local model, clearing relay | done, two live negotiations on Base Sepolia |
| Payment at the settled price over x402 | done, three live payments on Base Sepolia and one refused overcharge |
| Agent budget in a Base Account with a Spend Permission | done, three draws inside the cap and a fourth rejected by Base |
| Judge page with both negotiations and the payment | done, live at [sealed-base.vercel.app](https://sealed-base.vercel.app) |

## Built before and during the hackathon

Sealed started as a prototype on Monad, written for a different hackathon. The first two commits in this repository (2026-09-17) are that prototype: the core contracts, the test suite and a Privy wallet policy, which was removed on 2026-10-08. Everything after them is the Base version built for Colosseum Crypto World's Fair. The history is kept on purpose so anyone can check with `git log` which work came from the Monad prototype.

## License

MIT. See [LICENSE](LICENSE).
